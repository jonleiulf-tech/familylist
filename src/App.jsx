import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isConfigured } from './lib/supabase.js';
import { useAuth, signOut } from './hooks/useAuth.js';
import { useSharedLists, capturePendingInvite } from './hooks/useSharedLists.js';
import { useReferenceData } from './hooks/useReferenceData.js';
import { useShoppingItems } from './hooks/useShoppingItems.js';
import { useCustomLists } from './hooks/useCustomLists.js';
import { usePickOrder } from './hooks/usePickOrder.js';
import { useMealPlan } from './hooks/useMealPlan.js';
import { useSavedTrips } from './hooks/useSavedTrips.js';
import { useToast } from './hooks/useToast.js';
import { applyReceipt } from './lib/applyReceipt.js';

import { MessageSquarePlus } from 'lucide-react';
import { Nav } from './components/Nav.jsx';
import { ListSwitcher } from './components/ListSwitcher.jsx';
import { FeedbackDialog } from './components/FeedbackDialog.jsx';
import { Toast } from './components/Toast.jsx';
import { SetPasswordDialog } from './components/SetPasswordDialog.jsx';
import { ProfileMenu } from './components/ProfileMenu.jsx';
import { SignIn } from './views/SignIn.jsx';
import { Onboarding } from './views/Onboarding.jsx';
import { Home } from './views/Home.jsx';
import { Shop } from './views/Shop.jsx';
import { Suggestions } from './views/Suggestions.jsx';
import { Meals } from './views/Meals.jsx';
import { Rules } from './views/Rules.jsx';
import { Offers } from './views/Offers.jsx';
import { Lists } from './views/Lists.jsx';

// Fang opp ?invite=… før React rekker å rydde URL-en.
capturePendingInvite();

function Shell({ children, header, tab, onTab, showNav }) {
  return (
    <div className="app-shell">
      <OfflineBanner />
      <div className="app-brand">
        {header}
        {showNav && <Nav tab={tab} onChange={onTab} />}
      </div>
      {showNav && <Nav tab={tab} onChange={onTab} className="app-sidebar" />}
      <main className="app-main">{children}</main>
    </div>
  );
}

function Header({ household, members, lists, onSelectList, onCreateList, user, onManageLists, onLeaveList, onReload, toast }) {
  // «Meld feil eller ønske» — liten knapp synlig øverst på ALLE faner.
  const [showFeedback, setShowFeedback] = useState(false);
  return (
    <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '14px 16px 10px' }}>
      <div>
        <a
          href="/app/"
          aria-label="Til forsiden av appen"
          style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-heading)', fontWeight: 800, fontSize: 19, letterSpacing: '-0.015em', lineHeight: 1.1, color: 'inherit', textDecoration: 'none' }}
        >
          <svg width="22" height="22" viewBox="0 0 64 64" aria-hidden="true">
            <rect width="64" height="64" rx="12" fill="var(--color-text)" />
            <path d="M14 33 L25 44 L43 19" stroke="var(--color-bg)" strokeWidth="8.5" fill="none" strokeLinecap="square" />
            <circle cx="50" cy="44" r="6" fill="var(--color-accent)" />
          </svg>
          <span>PLUKKELISTEN<span style={{ color: 'var(--color-accent)' }}>.</span></span>
        </a>
        {household && (
          <div style={{ marginLeft: -6 }}>
            <ListSwitcher
              lists={lists}
              activeList={household}
              onSelect={onSelectList}
              onCreate={onCreateList}
            />
          </div>
        )}
      </div>
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            type="button"
            className="btn btn-icon btn-sm"
            aria-label="Meld feil eller ønske"
            title="Meld feil eller ønske"
            onClick={() => setShowFeedback(true)}
            style={{ color: 'var(--color-text-muted)' }}
          >
            <MessageSquarePlus size={17} />
          </button>
          <ProfileMenu
            user={user}
            members={members}
            lists={lists}
            activeList={household}
            onSelectList={onSelectList}
            onLeaveList={onLeaveList}
            onGoLists={onManageLists}
            onSaved={onReload}
            toast={toast}
          />
        </div>
      )}
      {showFeedback && user && (
        <FeedbackDialog
          user={user}
          householdId={household?.id ?? null}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </header>
  );
}

/** Slank stripe øverst når enheten er uten nett — lista kan fortsatt leses. */
function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down); };
  }, []);
  if (online) return null;
  return (
    <div
      role="status"
      style={{
        position: 'sticky', top: 0, zIndex: 60, textAlign: 'center',
        background: 'var(--ink)', color: 'var(--ground)',
        fontSize: 12, fontWeight: 600, padding: '6px 12px',
      }}
    >
      Uten nett — viser sist kjente liste. Endringer krever dekning.
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState('hjem');
  const { user, loading: authLoading, recovery, clearRecovery } = useAuth();
  const shared = useSharedLists(user);
  const {
    activeList: household, members, loading: hhLoading, stage,
    bootstrap, createInvite, redeemInvite, isOwner,
  } = shared;
  const { toast, show, undo, dismiss } = useToast();

  const householdId = household?.id ?? null;
  const defaultStore = household?.default_store ?? 'Coop Extra';

  const reference = useReferenceData(Boolean(householdId));
  const pickOrder = usePickOrder(householdId);
  const mealPlan = useMealPlan(householdId);
  const savedTrips = useSavedTrips(householdId);

  // «Marte plukket Melk» — kun når det var den andre som krysset av.
  const onRemoteCheck = useCallback((row) => {
    const who = members.find((m) => m.user_id === row.checked_by)?.display_name ?? 'Den andre';
    show(`${who} plukket ${row.name}`);
  }, [members, show]);

  const shop = useShoppingItems(householdId, user?.id ?? null, { onRemoteCheck });

  const onRemoteListChange = useCallback((row) => {
    show(`«${row.name}» ble oppdatert`);
  }, [show]);
  const lists = useCustomLists(householdId, user?.id ?? null, { onRemoteChange: onRemoteListChange });

  // Forslag om ny vare til fellesdatabasen — publiseres først når admin
  // har godkjent i adminpanelet. Brukerens egen liste påvirkes ikke.
  const suggestItem = useCallback(async ({ name, category, price_estimate, store }) => {
    if (!householdId || !user) return 'Ikke innlogget.';
    const { error } = await supabase.from('catalog_suggestions').insert({
      household_id: householdId,
      suggested_by: user.id,
      name, category, price_estimate, store,
    });
    return error ? (error.message || 'Kunne ikke sende forslaget.') : null;
  }, [householdId, user]);

  // «Meld feil» på en vare — lagres i item_reports og gjennomgås automatisk
  // hver natt av review-item-reports-funksjonen.
  const reportItem = useCallback(async ({ item_name, report_type, suggestion, comment }) => {
    if (!householdId || !user) return 'Ikke innlogget.';
    const catalogHit = reference.catalog.find(
      (c) => c.name.toLowerCase() === String(item_name).toLowerCase(),
    );
    const { error } = await supabase.from('item_reports').insert({
      household_id: householdId,
      reported_by: user.id,
      item_name,
      catalog_id: catalogHit?.id ?? null,
      report_type,
      suggestion,
      comment,
    });
    return error ? (error.message || 'Kunne ikke sende inn.') : null;
  }, [householdId, user, reference.catalog]);

  // Familiens porsjonsprofil (voksne/barn) bor på husholdningen — alle
  // medlemmer kan justere den, og kokebok-oppskrifter skaleres etter den.
  const savePortions = useCallback(async (patch) => {
    if (!householdId) return 'Ikke innlogget.';
    return shared.updateList(householdId, patch);
  }, [householdId, shared]);

  // Skjulte biblioteksmiddager: slettes «Omelett med skinke» fra lagrede
  // middager, skal den heller aldri foreslås igjen for denne husholdningen.
  const hiddenMeals = household?.hidden_meals ?? [];
  const setHiddenMeals = useCallback(async (names) => {
    if (!householdId) return;
    await shared.updateList(householdId, { hidden_meals: names });
  }, [householdId, shared]);
  const hideMeal = useCallback(
    (name) => setHiddenMeals([...new Set([...hiddenMeals, name])]),
    [hiddenMeals, setHiddenMeals],
  );
  const unhideMeal = useCallback(
    (name) => setHiddenMeals(hiddenMeals.filter((n) => n.toLowerCase() !== String(name).toLowerCase())),
    [hiddenMeals, setHiddenMeals],
  );

  // Lagre middag + av-skjul navnet automatisk: lagrer noen «Omelett med
  // skinke» på nytt (bevisst valg), skal den ikke lenger være skjult.
  const saveMealAndUnhide = useCallback(async (meal) => {
    const err = await mealPlan.saveMeal(meal);
    if (!err && meal?.name
      && hiddenMeals.some((n) => n.toLowerCase() === meal.name.toLowerCase())) {
      await unhideMeal(meal.name);
    }
    return err;
  }, [mealPlan, hiddenMeals, unhideMeal]);

  // «Hent inspirasjon» kan åpnes rett fra Hjem-kortet: bytt fane og be
  // Middag-fanen åpne kokebok-dialogen (telleren trigger useEffect der).
  const [inspireSignal, setInspireSignal] = useState(0);
  const goInspiration = useCallback(() => {
    setTab('middag');
    setInspireSignal((n) => n + 1);
  }, []);

  const [offers, setOffers] = useState([]);
  const [rules, setRules] = useState([]);
  const [itemTags, setItemTags] = useState({ staples: new Set(), dairyFree: new Set() });
  const [importQueue, setImportQueue] = useState([]);

  useEffect(() => {
    if (!householdId) return;
    (async () => {
      const [of, rl, tg, iq] = await Promise.all([
        supabase.from('offers').select('*').gte('valid_to', new Date().toISOString().slice(0, 10)).order('valid_to'),
        supabase.from('rules').select('*').eq('household_id', householdId).order('created_at'),
        supabase.from('item_tags').select('item_name, tag'),
        supabase.from('import_queue').select('*')
          .eq('household_id', householdId).eq('status', 'pending').order('created_at'),
      ]);
      setOffers(of.data ?? []);
      setRules(rl.data ?? []);
      setItemTags({
        staples: new Set((tg.data ?? []).filter((r) => r.tag === 'staple').map((r) => r.item_name.toLowerCase())),
        dairyFree: new Set((tg.data ?? []).filter((r) => r.tag === 'dairy_free').map((r) => r.item_name.toLowerCase())),
      });
      setImportQueue(iq.data ?? []);
    })();
  }, [householdId]);

  const existingNames = useMemo(
    () => new Set(shop.items.map((i) => i.name.toLowerCase())),
    [shop.items],
  );

  // Ingredienser i denne ukens planlagte middager — gir tilbud +25 i relevans.
  const plannedIngredients = useMemo(() => {
    const names = new Set();
    mealPlan.plan.forEach((day) => {
      if (!day.meal_name || day.skipped) return;
      const meal = mealPlan.meals.find((m) => m.name === day.meal_name);
      (meal?.ingredients ?? []).forEach((ing) => names.add(String(ing.n).toLowerCase()));
    });
    return names;
  }, [mealPlan.plan, mealPlan.meals]);

  /**
   * −/+ på en vare utenfor Handel-fanen (Hjem-listen): samme oppførsel som
   * i Handel — gram/liter steppes i pakker, minus under én pakke fjerner
   * varen med angremulighet i toasten.
   */
  const stepItem = useCallback(async (item, dir) => {
    const pack = Number(item.pack_size) || 0;
    const stepBy = pack > 0 ? pack : 1;
    const next = (Number(item.qty) || 0) + dir * stepBy;
    if (next < stepBy) {
      const snapshot = await shop.removeItem(item.id);
      show(`${item.name} fjernet`, () => shop.restoreItem(snapshot));
      return;
    }
    await shop.updateItem(item.id, { qty: next });
  }, [shop, show]);

  /** Legg et tilbud på handlelisten — eventuelt som vare i en annen butikk. */
  const addOfferToList = useCallback(async (o, storeOverride = null) => {
    await shop.addItem({
      name: o.match_name || o.product_name,
      qty: 1, unit: 'stk', category: o.category || 'Annet',
      store: storeOverride ?? o.store_name, price: o.price,
      price_source: 'manual', is_offer: true,
    });
    show(`${o.product_name} lagt til${storeOverride ? ` som ${storeOverride}-vare` : ''}`);
  }, [shop, show]);

  /**
   * Felles innsending fra gjennomgangsdialogen: nye varer legges til,
   * kjente økes. goToList styrer om appen hopper til Handel etterpå —
   * én middag fra Middag-fanen blir stående (dagen får et merke i stedet),
   * mens ukas samlede sending og de andre fanene hopper som før.
   */
  const sendToList = useCallback(async (rows, { goToList = true } = {}) => {
    const fresh = [];
    for (const r of rows) {
      const existing = shop.items.find((i) => i.name.toLowerCase() === r.name.toLowerCase());
      if (existing) {
        // Samme vare og samme enhet: mengdene summeres (400 g + 600 g = 1 kg-ish).
        // Ulik enhet (1 stk fra før, 600 g fra oppskrift): varen står alt på
        // listen — vi lager aldri en duplikatrad, og blander aldri enheter.
        if ((existing.unit || 'stk') === (r.unit || 'stk')) {
          await shop.updateItem(existing.id, { qty: Number(existing.qty) + Number(r.qty || 1) });
        }
      } else {
        fresh.push({
          name: r.name, qty: r.qty, unit: r.unit, category: r.category,
          store: r.store ?? defaultStore, price: r.price ?? null,
          price_source: r.price_source ?? null, pack_size: r.pack_size ?? null,
        });
      }
    }
    if (fresh.length) await shop.addMany(fresh);
    show(`La til ${rows.length} ${rows.length === 1 ? 'vare' : 'varer'} på handlelisten`);
    if (goToList) setTab('handel');
  }, [shop, defaultStore, show]);

  // --- Tilstander før appen er klar ----------------------------------------
  if (!isConfigured) {
    return (
      <Shell header={<Header household={null} members={[]} />} showNav={false}>
        <div style={{ padding: 'var(--space-5) var(--space-4)' }}>
          <h1 style={{ fontSize: 20 }}>Mangler Supabase-oppsett</h1>
          <p style={{ fontSize: 13, lineHeight: 1.5, marginTop: 10 }}>
            Kopier <code>.env.example</code> til <code>.env</code> og fyll inn{' '}
            <code>VITE_SUPABASE_URL</code> og <code>VITE_SUPABASE_ANON_KEY</code>.
            Se <code>SETUP.md</code> for full framgangsmåte.
          </p>
        </div>
      </Shell>
    );
  }

  if (authLoading || (user && hhLoading)) {
    return (
      <Shell header={<Header household={null} members={[]} />} showNav={false}>
        <p className="text-muted" style={{ padding: 'var(--space-5) var(--space-4)', fontSize: 13 }}>Laster …</p>
      </Shell>
    );
  }

  if (!user) {
    return (
      <Shell header={<Header household={null} members={[]} />} showNav={false}>
        <SignIn />
      </Shell>
    );
  }

  if (stage === 'needs-name' || !household) {
    return (
      <Shell header={<Header household={null} members={[]} />} showNav={false}>
        <Onboarding user={user} onBootstrap={bootstrap} onCreateList={shared.createList} onRedeem={redeemInvite} />
        {recovery && <SetPasswordDialog onDone={clearRecovery} toast={show} />}
      </Shell>
    );
  }

  // --- Appen ---------------------------------------------------------------
  return (
    <Shell
      header={(
        <Header
          household={household}
          members={members}
          lists={shared.lists}
          onSelectList={shared.setActive}
          onCreateList={shared.createList}
          user={user}
          onManageLists={() => setTab('lister')}
          onLeaveList={shared.leaveList}
          onReload={shared.reload}
          toast={show}
        />
      )}
      tab={tab}
      onTab={setTab}
      showNav
    >
      {recovery && user && (
        <SetPasswordDialog onDone={clearRecovery} toast={show} />
      )}

      {tab === 'hjem' && (
        <Home
          household={household}
          items={shop.items}
          onToggle={shop.toggleChecked}
          onStep={stepItem}
          plan={mealPlan.plan}
          meals={mealPlan.meals}
          catalog={reference.catalog}
          rules={rules}
          existingNames={existingNames}
          defaultStore={defaultStore}
          onGo={setTab}
          onGoInspiration={goInspiration}
          onSendToList={sendToList}
        />
      )}

      {tab === 'handel' && (
        <Shop
          items={shop.items}
          catalog={reference.catalog}
          normRules={reference.normRules}
          stores={reference.stores}
          defaultStore={defaultStore}
          addItem={shop.addItem}
          addMany={shop.addMany}
          updateItem={shop.updateItem}
          toggleChecked={shop.toggleChecked}
          removeItem={shop.removeItem}
          restoreItem={shop.restoreItem}
          clearAll={shop.clearAll}
          positionOf={pickOrder.positionOf}
          hasLearnedFor={pickOrder.hasLearnedFor}
          learnFromTrip={pickOrder.learnFromTrip}
          saveTrip={savedTrips.saveTrip}
          toast={show}
          reportItem={reportItem}
          onSuggestItem={suggestItem}
        />
      )}

      {tab === 'forslag' && (
        <Suggestions
          trips={savedTrips.trips}
          catalog={reference.catalog}
          normRules={reference.normRules}
          offers={offers}
          existingNames={existingNames}
          defaultStore={defaultStore}
          plan={mealPlan.plan}
          meals={mealPlan.meals}
          rules={rules}
          shopItems={shop.items}
          plannedIngredients={plannedIngredients}
          itemTags={itemTags}
          onSendToList={sendToList}
          onDeleteTrip={async (t) => {
            const snapshot = await savedTrips.removeTrip(t.id);
            show(`«${t.name}» slettet`, () => savedTrips.restoreTrip(snapshot));
          }}
          onAddOffer={addOfferToList}
          onGo={setTab}
          toast={show}
        />
      )}

      {tab === 'middag' && (
        <Meals
          plan={mealPlan.plan} meals={mealPlan.meals} mealLibrary={reference.mealLibrary}
          catalog={reference.catalog} normRules={reference.normRules} defaultStore={defaultStore}
          rules={rules} history={mealPlan.history} existingNames={existingNames}
          household={household}
          onSetMeal={mealPlan.setMeal} onSkipDay={mealPlan.skipDay} onAddDays={mealPlan.addDays}
          onRemoveLastDay={mealPlan.removeLastDay}
          onToggleLock={mealPlan.toggleLock}
          weekTemplates={mealPlan.weekTemplates}
          onSaveWeekTemplate={mealPlan.saveWeekTemplate}
          onApplyWeekTemplate={mealPlan.applyWeekTemplate}
          onDeleteWeekTemplate={mealPlan.deleteWeekTemplate}
          onSaveMeal={saveMealAndUnhide}
          onDeleteMeal={mealPlan.deleteMeal}
          onSetGuests={mealPlan.setGuests}
          onSavePortions={savePortions}
          onMarkSent={mealPlan.markSent}
          onGoShopping={() => setTab('handel')}
          hiddenMeals={hiddenMeals}
          onHideMeal={hideMeal}
          onUnhideMeal={unhideMeal}
          inspireSignal={inspireSignal}
          onSendToList={sendToList} onApplyGenerated={mealPlan.applyGenerated} toast={show}
        />
      )}

      {tab === 'regler' && (
        <Rules
          rules={rules}
          meals={mealPlan.meals}
          history={mealPlan.history}
          toast={show}
          onSave={async (r) => {
            const payload = {
              household_id: householdId, scope: r.scope, rule_type: r.rule_type,
              amount: r.amount, weekdays: r.weekdays, enabled: r.enabled ?? true,
            };
            if (r.id) await supabase.from('rules').update(payload).eq('id', r.id);
            else await supabase.from('rules').insert(payload);
            const { data } = await supabase.from('rules').select('*').eq('household_id', householdId).order('created_at');
            setRules(data ?? []);
          }}
          onToggle={async (r) => {
            await supabase.from('rules').update({ enabled: !r.enabled }).eq('id', r.id);
            setRules((cur) => cur.map((x) => (x.id === r.id ? { ...x, enabled: !x.enabled } : x)));
          }}
          onDelete={async (id) => {
            await supabase.from('rules').delete().eq('id', id);
            setRules((cur) => cur.filter((x) => x.id !== id));
          }}
        />
      )}

      {tab === 'tilbud' && (
        <Offers
          offers={offers}
          stores={reference.stores}
          catalog={reference.catalog}
          normRules={reference.normRules}
          shopItems={shop.items}
          plannedIngredients={plannedIngredients}
          itemTags={itemTags}
          defaultStore={defaultStore}
          toast={show}
          onManualImport={async (rows) => {
            // Skann og manuell import deles med ALLE brukere (fellesgode,
            // household_id null) — bidragsyteren stemples og får Plukkepoeng
            // via databasetriggeren (+15 per butikk per uke).
            const payload = rows.map((r) => ({ ...r, household_id: null, created_by: user.id }));
            await supabase.from('offers').insert(payload);
            const { data } = await supabase.from('offers').select('*')
              .gte('valid_to', new Date().toISOString().slice(0, 10)).order('valid_to');
            setOffers(data ?? []);
          }}
          onAddToList={addOfferToList}
        />
      )}

      {tab === 'lister' && (
        <Lists
          household={household}
          members={members}
          lists={lists}
          catalog={reference.catalog}
          normRules={reference.normRules}
          defaultStore={defaultStore}
          importQueue={importQueue}
          shoppingItems={shop.items}
          isOwner={isOwner}
          onRemoveMember={shared.removeMember}
          onLeaveList={shared.leaveList}
          onUpdateList={shared.updateList}
          onCreateInvite={createInvite}
          onSendInvite={shared.sendInvite}
          onRedeemInvite={redeemInvite}
          onSignOut={signOut}
          toast={show}
          onImport={sendToList}
          onQueue={async (rows) => {
            const payload = rows.map((r) => ({ ...r, household_id: householdId }));
            const { data } = await supabase.from('import_queue').insert(payload).select();
            setImportQueue((cur) => [...cur, ...(data ?? [])]);
          }}
          onReceipt={async (result, confidence) => {
            await applyReceipt(result, confidence, reference.catalog, reference.normRules);
          }}
          onQueueResolve={async (entry, status) => {
            if (status === 'accepted') {
              await sendToList([{
                name: entry.suggestion || entry.raw_text,
                qty: 1, unit: 'stk', category: 'Annet', store: defaultStore,
              }]);
            }
            await supabase.from('import_queue').update({ status }).eq('id', entry.id);
            setImportQueue((cur) => cur.filter((q) => q.id !== entry.id));
          }}
        />
      )}

      <Toast toast={toast} onUndo={undo} onDismiss={dismiss} />
    </Shell>
  );
}
