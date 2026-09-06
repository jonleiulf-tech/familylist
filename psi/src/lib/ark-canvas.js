/* Tegner et ark på et lerret, i piksler.

   Sosiale medier vil ha PNG i eksakte mål – 1080 × 1080, ikke «omtrent».
   Utskrift til PDF gir ikke det, så disse formatene tegnes i stedet
   direkte på et canvas. Samme lerret brukes til forhåndsvisningen og til
   fila som lastes ned, så det du ser er det du får.

   Rollup går fortsatt gjennom utskrift: der er vektortekst og et lite
   filformat verdt mer enn eksakte piksler. */

export const PSI = {
  svart: '#0d0d0c',
  kull: '#17171a',
  krem: '#f3efe7',
  oransje: '#ff6a1a',
  dempet: '#cfc9bd',
};

/* Bryter tekst til linjer som får plass. `mål` er en funksjon som sier
   hvor bred en streng blir – da kan brytingen prøves uten nettleser. */
export function bryt(mål, tekst, maksBredde, maksLinjer = 99) {
  const ord = String(tekst || '').split(/\s+/).filter(Boolean);
  const linjer = [];
  let linje = '';
  for (const o of ord) {
    const forsøk = linje ? `${linje} ${o}` : o;
    if (mål(forsøk) > maksBredde && linje) {
      linjer.push(linje);
      linje = o;
    } else {
      linje = forsøk;
    }
  }
  if (linje) linjer.push(linje);
  const vist = linjer.slice(0, maksLinjer);
  if (linjer.length > maksLinjer && vist.length) vist[vist.length - 1] = `${vist[vist.length - 1]} …`;
  return vist;
}

const måler = (ctx) => (t) => ctx.measureText(t).width;

/* Skriver teksten og sier hvor høy den ble. */
export function skrivLinjer(ctx, tekst, x, y, maksBredde, linjehøyde, maksLinjer = 99) {
  const linjer = bryt(måler(ctx), tekst, maksBredde, maksLinjer);
  linjer.forEach((l, i) => ctx.fillText(l, x, y + i * linjehøyde));
  return linjer.length * linjehøyde;
}

/* Utsnitt som object-fit: cover med et fokuspunkt i prosent. */
export function dekk(bildeB, bildeH, boksB, boksH, fx = 50, fy = 50) {
  const skala = Math.max(boksB / bildeB, boksH / bildeH);
  const b = boksB / skala;
  const h = boksH / skala;
  return { sx: (bildeB - b) * (fx / 100), sy: (bildeH - h) * (fy / 100), sb: b, sh: h };
}

/* Tegner hele arket. `spec` er rene verdier, ingen DOM utenom bildene,
   slik at funksjonen kan prøves uten nettleser. */
export function tegnArk(ctx, spec) {
  const { bredde: B, høyde: H } = spec;
  const kant = Math.round(Math.min(B, H) * 0.075);
  const stor = H > B * 1.4;            // story: bilde øverst, tekst under
  const s = Math.min(B, H) / 1080;     // skriftskala

  ctx.fillStyle = PSI.svart;
  ctx.fillRect(0, 0, B, H);

  // Bildet fyller hele flata på liggende og kvadratisk, øvre del på story.
  const bildeH = stor ? Math.round(H * 0.52) : H;
  if (spec.foto) {
    const { sx, sy, sb, sh } = dekk(spec.foto.width, spec.foto.height, B, bildeH, spec.fokusX, spec.fokusY);
    ctx.drawImage(spec.foto, sx, sy, sb, sh, 0, 0, B, bildeH);
  }

  // Slør slik at teksten er lesbar uansett motiv.
  const slør = ctx.createLinearGradient(0, stor ? bildeH * 0.45 : H * 0.25, 0, stor ? bildeH : H);
  slør.addColorStop(0, 'rgba(13,13,12,0)');
  slør.addColorStop(1, stor ? 'rgba(13,13,12,1)' : 'rgba(13,13,12,0.92)');
  ctx.fillStyle = slør;
  ctx.fillRect(0, 0, B, stor ? bildeH : H);

  // Tekstblokka står nede til venstre.
  let y = stor ? bildeH + Math.round(70 * s) : H - kant - Math.round(40 * s);
  const x = kant;
  const tekstB = B - kant * 2 - (spec.qr ? Math.round(280 * s) : 0);

  if (!stor) {
    // Liggende og kvadratisk: regn oppover fra bunnen.
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PSI.dempet;
    ctx.font = `500 ${Math.round(30 * s)}px Barlow, system-ui, sans-serif`;
    const leadH = måleHøyde(ctx, spec.lead, tekstB, Math.round(40 * s), 3);
    ctx.font = `800 ${Math.round(86 * s)}px "Barlow Condensed", Barlow, system-ui, sans-serif`;
    const tittelH = måleHøyde(ctx, spec.tittel, tekstB, Math.round(84 * s), 2);
    // Adressen står nederst; teksten må slutte over den, ikke på den.
    const adresseH = Math.round(46 * s);
    y = H - kant - adresseH - leadH - tittelH - Math.round(30 * s);
  }

  ctx.textBaseline = 'top';
  ctx.fillStyle = PSI.oransje;
  ctx.font = `700 ${Math.round(24 * s)}px "Barlow Condensed", Barlow, system-ui, sans-serif`;
  ctx.letterSpacing = `${Math.round(3 * s)}px`;
  ctx.fillText(String(spec.eyebrow || '').toUpperCase(), x, y);
  ctx.letterSpacing = '0px';
  y += Math.round(40 * s);

  ctx.fillStyle = PSI.krem;
  ctx.font = `800 ${Math.round(86 * s)}px "Barlow Condensed", Barlow, system-ui, sans-serif`;
  y += skrivLinjer(ctx, String(spec.tittel || '').toUpperCase(), x, y, tekstB, Math.round(84 * s), 2);
  y += Math.round(14 * s);

  ctx.fillStyle = PSI.dempet;
  ctx.font = `500 ${Math.round(30 * s)}px Barlow, system-ui, sans-serif`;
  y += skrivLinjer(ctx, spec.lead, x, y, tekstB, Math.round(40 * s), 3);

  if (stor && spec.tider?.length) {
    y += Math.round(24 * s);
    for (const t of spec.tider.slice(0, 4)) {
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(B - kant, y);
      ctx.stroke();
      y += Math.round(14 * s);
      ctx.fillStyle = PSI.krem;
      ctx.font = `700 ${Math.round(30 * s)}px "Barlow Condensed", Barlow, system-ui, sans-serif`;
      ctx.fillText(t.dag.toUpperCase(), x, y);
      ctx.textAlign = 'right';
      ctx.font = `500 ${Math.round(28 * s)}px Barlow, system-ui, sans-serif`;
      ctx.fillText(t.tid, B - kant, y);
      ctx.textAlign = 'left';
      y += Math.round(46 * s);
    }
  }

  // QR og adresse nederst til høyre.
  const qrS = Math.round(190 * s);
  if (spec.qr) {
    const qx = B - kant - qrS;
    const qy = H - kant - qrS;
    ctx.fillStyle = '#fff';
    ctx.fillRect(qx - Math.round(12 * s), qy - Math.round(12 * s), qrS + Math.round(24 * s), qrS + Math.round(24 * s));
    ctx.drawImage(spec.qr, qx, qy, qrS, qrS);
  }

  ctx.fillStyle = PSI.oransje;
  ctx.font = `700 ${Math.round(26 * s)}px "Barlow Condensed", Barlow, system-ui, sans-serif`;
  ctx.letterSpacing = `${Math.round(2 * s)}px`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(spec.url || '').toUpperCase(), kant, H - kant + Math.round(8 * s));
  ctx.letterSpacing = '0px';

  if (spec.logo) {
    const lb = Math.round(150 * s);
    const lh = (spec.logo.height / spec.logo.width) * lb;
    ctx.drawImage(spec.logo, B - kant - lb, kant, lb, lh);
  }
}

function måleHøyde(ctx, tekst, maksBredde, linjehøyde, maksLinjer) {
  return bryt(måler(ctx), tekst, maksBredde, maksLinjer).length * linjehøyde;
}
