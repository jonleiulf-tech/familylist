<#
.SYNOPSIS
  Kjører SQL-migrasjonene i psi/supabase/migrations mot Supabase-prosjektet,
  så du slipper å lime dem inn i SQL Editor for hånd.

.DESCRIPTION
  Filene kjøres i rekkefølge etter navn (0001, 0002, …). Hvilke som er kjørt
  huskes i tabellen public.schema_migrations, så skriptet gjør bare det som
  gjenstår. Alle filene tåler å kjøres om igjen, så har du allerede limt inn
  noen for hånd, går det bra.

  Trenger et personlig tilgangstoken fra
  https://supabase.com/dashboard/account/tokens (starter med sbp_).
  Tokenet lagres aldri i repoet.

.EXAMPLE
  .\scripts\db.ps1 -Status
  Viser hva som er kjørt og hva som gjenstår, uten å endre noe.

.EXAMPLE
  .\scripts\db.ps1
  Kjører migrasjonene som gjenstår.

.EXAMPLE
  .\scripts\db.ps1 -SaveToken
  Spør etter tokenet og lagrer det i hjemmemappa di, så du slipper neste gang.
#>
# NB: denne fila MÅ lagres som UTF-8 med BOM. Windows PowerShell 5.1 leser
# filer uten BOM som Windows-1252, og da blir æøå til søppel som knekker
# parseren. Det finnes en test som feiler hvis BOM-en forsvinner.
[CmdletBinding()]
param(
  [string] $Token,
  [string] $Ref,
  [switch] $Status,
  [switch] $DryRun,
  [switch] $Force,
  [switch] $SaveToken
)

$ErrorActionPreference = 'Stop'
# Windows PowerShell 5.1 snakker TLS 1.0 som standard, som Supabase avviser.
try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch { }

$here          = Split-Path -Parent $MyInvocation.MyCommand.Path
$psiRoot       = Split-Path -Parent $here
$migrationsDir = Join-Path $psiRoot 'supabase\migrations'
$projectFile   = Join-Path $psiRoot 'supabase\project.json'
$tokenFile     = Join-Path $HOME '.psiusn\supabase-token.txt'

function Write-Step ($text) { Write-Host "  $text" }
function Write-Ok   ($text) { Write-Host "  $text" -ForegroundColor Green }
function Write-Warn ($text) { Write-Host "  $text" -ForegroundColor Yellow }
function Write-Bad  ($text) { Write-Host "  $text" -ForegroundColor Red }

# ---------------------------------------------------------------- token og prosjekt

function Get-Token {
  if ($Token)                        { return $Token }
  if ($env:SUPABASE_ACCESS_TOKEN)    { return $env:SUPABASE_ACCESS_TOKEN }
  if (Test-Path $tokenFile)          { return (Get-Content $tokenFile -Raw).Trim() }
  return $null
}

function Save-Token {
  Write-Host ''
  Write-Host '  Tokenet ligger på KONTOEN din, ikke på prosjektet.' -ForegroundColor Yellow
  Write-Host '  Det er ikke det samme som anon-nøkkelen eller service_role.'
  Write-Host ''
  Write-Host '   1. Åpne https://supabase.com/dashboard/account/tokens'
  Write-Host '      (eller: klikk navnet ditt nede til venstre i Supabase →'
  Write-Host '       Account preferences → Access tokens)'
  Write-Host '   2. Generate new token → gi det et navn, f.eks. psiusn'
  Write-Host '   3. Blir du spurt om Permissions: skriptet trenger bare Database.'
  Write-Host '      Sett resten til None, så kan ikke tokenet gjøre noe annet.'
  Write-Host '      Preset «Full access» virker også, men gir mer enn nødvendig.'
  Write-Host '   4. Kopier verdien. Den starter med sbp_ og vises bare denne ene gangen.'
  Write-Host ''
  Write-Host '  Du ser ingenting mens du limer inn under. Det er meningen.' -ForegroundColor DarkGray
  Write-Host '  Høyreklikk limer inn i det gamle konsollet, Ctrl+V i Windows Terminal.' -ForegroundColor DarkGray
  Write-Host ''
  $secure = Read-Host -Prompt '  Lim inn tokenet og trykk Enter' -AsSecureString
  $plain  = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
              [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if (-not $plain) { throw 'Ingen token oppgitt.' }
  $plain = $plain.Trim()
  if ($plain.StartsWith('eyJ')) {
    throw 'Det der er en anon- eller service_role-nøkkel (den starter med eyJ). Skriptet trenger et personlig tilgangstoken fra supabase.com/dashboard/account/tokens, som starter med sbp_.'
  }
  if (-not $plain.StartsWith('sbp_')) {
    Write-Warn 'Tokenet starter vanligvis med sbp_. Prøver likevel.'
  }
  $dir = Split-Path -Parent $tokenFile
  if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  Set-Content -Path $tokenFile -Value $plain -Encoding ascii -NoNewline
  Write-Ok "Lagret i $tokenFile. Det ligger utenfor repoet og blir aldri pushet."
  return $plain
}

function Get-Ref {
  if ($Ref)                         { return $Ref }
  if ($env:SUPABASE_PROJECT_REF)    { return $env:SUPABASE_PROJECT_REF }
  if (Test-Path $projectFile) {
    $cfg = Get-Content $projectFile -Raw | ConvertFrom-Json
    if ($cfg.ref) { return $cfg.ref }
  }
  throw "Fant ikke prosjekt-ID. Legg den i $projectFile, eller kjør med -Ref <id>. Den står i adressen i Supabase: https://supabase.com/dashboard/project/<id>"
}

# ---------------------------------------------------------------- SQL over HTTPS

# SUPABASE_API_URL finnes for at skriptet skal kunne testes mot en
# etterligning av API-et. La den stå tom i vanlig bruk.
$apiBase = 'https://api.supabase.com'
if ($env:SUPABASE_API_URL) { $apiBase = $env:SUPABASE_API_URL.TrimEnd('/') }

function Invoke-Sql ($sql, $token, $ref) {
  $uri   = "$apiBase/v1/projects/$ref/database/query"
  # read_only = false: uten den kjører API-et spørringen i en lesetransaksjon,
  # og da nekter Postgres å opprette tabeller (feil 25006).
  $json  = @{ query = $sql; read_only = $false } | ConvertTo-Json -Compress
  # Egne bytes: da spiller det ingen rolle om PowerShell escaper æøå eller ikke.
  $bytes = [Text.Encoding]::UTF8.GetBytes($json)
  try {
    return Invoke-RestMethod -Method Post -Uri $uri -Body $bytes `
      -ContentType 'application/json; charset=utf-8' `
      -Headers @{ Authorization = "Bearer $token" }
  } catch {
    throw (Get-ApiError $_)
  }
}

# Har tokenet bare lesetilgang, sier Postgres fra med 25006. Da hjelper det
# ikke å prøve igjen; det må et nytt token til.
function Test-ReadOnly ($message) {
  return ($message -match '25006' -or $message -match 'read-only transaction')
}

function Show-ReadOnlyHelp {
  Write-Host ''
  Write-Host '  Tokenet får bare lese fra databasen, ikke skrive.' -ForegroundColor Yellow
  Write-Host '  Migrasjoner oppretter tabeller, så det trengs skrivetilgang.'
  Write-Host ''
  Write-Host '   1. Åpne https://supabase.com/dashboard/account/tokens'
  Write-Host '   2. Slett tokenet du nettopp lagde, og lag et nytt'
  Write-Host '   3. Velg preset «Full access». Det er den sikre veien, og'
  Write-Host '      tokenet trengs bare denne ene gangen — slett det igjen'
  Write-Host '      så snart migrasjonene har gått gjennom.'
  Write-Host '   4. Kjør .\scripts\db.ps1 -SaveToken på nytt'
  Write-Host ''
  Write-Host '  Feiler det med Full access også, er det ikke tokenet:' -ForegroundColor DarkGray
  Write-Host '  da står hele prosjektet i skrivebeskyttet modus. Det skjer på' -ForegroundColor DarkGray
  Write-Host '  gratisnivået når databasen blir full. Supabase viser da et banner' -ForegroundColor DarkGray
  Write-Host '  øverst i dashbordet, og Database → Settings sier hvor mye plass' -ForegroundColor DarkGray
  Write-Host '  som er brukt.' -ForegroundColor DarkGray
  Write-Host ''
}

function Get-ApiError ($errorRecord) {
  $detail = $null
  if ($errorRecord.ErrorDetails -and $errorRecord.ErrorDetails.Message) {
    $detail = $errorRecord.ErrorDetails.Message              # PowerShell 7
  } elseif ($errorRecord.Exception.Response) {
    try {                                                     # Windows PowerShell 5.1
      $stream = $errorRecord.Exception.Response.GetResponseStream()
      $detail = (New-Object IO.StreamReader($stream)).ReadToEnd()
    } catch { }
  }
  if ($detail) {
    try { $parsed = $detail | ConvertFrom-Json } catch { $parsed = $null }
    if ($parsed -and $parsed.message) { return $parsed.message }
    return $detail
  }
  return $errorRecord.Exception.Message
}

# ---------------------------------------------------------------- kjøring

Write-Host ''
Write-Host 'psiusn.no – databasemigrasjoner' -ForegroundColor Cyan
Write-Host ''

if ($SaveToken) { $token = Save-Token } else { $token = Get-Token }
if (-not $token) {
  Write-Warn 'Fant ikke noe tilgangstoken.'
  $token = Save-Token
}
$ref = Get-Ref
Write-Step "Prosjekt: $ref"

if (-not (Test-Path $migrationsDir)) { throw "Fant ikke $migrationsDir" }
$files = Get-ChildItem -Path $migrationsDir -Filter '*.sql' | Sort-Object Name
if ($files.Count -eq 0) { throw "Ingen .sql-filer i $migrationsDir" }

Write-Step 'Kobler til …'
try {
  Invoke-Sql 'select 1 as ok;' $token $ref | Out-Null
} catch {
  if (Test-ReadOnly "$_") { Write-Bad "$_"; Show-ReadOnlyHelp; exit 1 }
  Write-Bad "Fikk ikke kontakt: $_"
  Write-Host ''
  Write-Host '  Sjekk at:' -ForegroundColor Yellow
  Write-Host '   - tokenet er et personlig tilgangstoken (sbp_…) fra supabase.com/dashboard/account/tokens,'
  Write-Host '     ikke anon-nøkkelen eller service_role-nøkkelen'
  Write-Host "   - prosjekt-ID-en stemmer: https://supabase.com/dashboard/project/$ref"
  Write-Host '   - tokenet har Database-tilgang. Er alt satt til None, får du 403 her.'
  Write-Host '   - du kan nå api.supabase.com (brannmur/VPN)'
  Write-Host ''
  Write-Host '  Kommer du ikke videre, virker den gamle måten fortsatt: åpne'
  Write-Host '  Supabase → SQL Editor og lim inn filene i supabase/migrations i rekkefølge.'
  exit 1
}
Write-Ok 'Tilkoblet.'

# Tabellen som husker hva som er kjørt. Første skriving, så det er her en
# manglende skrivetilgang gir seg til kjenne.
try {
  Invoke-Sql @'
create table if not exists public.schema_migrations (
  name       text primary key,
  applied_at timestamptz not null default now()
);
'@ $token $ref | Out-Null
} catch {
  if (Test-ReadOnly "$_") { Write-Bad "$_"; Show-ReadOnlyHelp; exit 1 }
  throw
}

$appliedRows = Invoke-Sql 'select name from public.schema_migrations;' $token $ref
$applied = @()
foreach ($row in $appliedRows) { $applied += $row.name }

Write-Host ''
foreach ($file in $files) {
  $isApplied = $applied -contains $file.Name
  if ($isApplied) { Write-Host ("  [kjørt]     " + $file.Name) -ForegroundColor DarkGray }
  else            { Write-Host ("  [gjenstår]  " + $file.Name) -ForegroundColor Yellow }
}
Write-Host ''

$todo = @()
foreach ($file in $files) {
  if ($Force -or -not ($applied -contains $file.Name)) { $todo += $file }
}

if ($Status) { Write-Step 'Bare status, ingenting kjørt.'; exit 0 }
if ($todo.Count -eq 0) { Write-Ok 'Databasen er oppdatert. Ingenting å gjøre.'; exit 0 }
if ($DryRun) {
  Write-Step "Tørrkjøring: ville kjørt $($todo.Count) fil(er). Ingenting er endret."
  exit 0
}

foreach ($file in $todo) {
  Write-Step "Kjører $($file.Name) …"
  $sql = Get-Content -Path $file.FullName -Raw -Encoding UTF8
  try {
    Invoke-Sql $sql $token $ref | Out-Null
  } catch {
    Write-Bad "$($file.Name) feilet: $_"
    if (Test-ReadOnly "$_") { Show-ReadOnlyHelp; exit 1 }
    Write-Host ''
    Write-Host '  Ingenting etter denne fila er kjørt. Rett feilen, eller lim inn'
    Write-Host "  $($file.FullName) i Supabase → SQL Editor for å se hvor det stopper."
    exit 1
  }
  $escaped = $file.Name.Replace("'", "''")
  try {
    Invoke-Sql "insert into public.schema_migrations (name) values ('$escaped') on conflict (name) do nothing;" $token $ref | Out-Null
  } catch {
    # Selve migrasjonen gikk bra; vi klarte bare ikke å notere det. Filene
    # tåler å kjøres om igjen, så dette er en advarsel, ikke en stopp.
    Write-Warn "$($file.Name) ble kjørt, men kunne ikke noteres som ferdig: $_"
    Write-Warn 'Den blir forsøkt kjørt igjen neste gang. Det er trygt.'
  }
  Write-Ok "$($file.Name) ferdig."
}

Write-Host ''
Write-Ok "Ferdig. $($todo.Count) migrasjon(er) kjørt."
Write-Host '  Nettsiden bruker det nye med én gang; du trenger ikke deploye på nytt.'
Write-Host ''
