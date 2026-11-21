// Raport tygodniowy jako skoroszyt Excel (.xlsx) ze zdjęciami dań.
// Plik budujemy sami (XML + JSZip), bez serwera. Otwiera się w Excelu, Numbers i Arkuszach Google.
/* global JSZip, state, cur, MEALS, DAYN, dayKey, ZdsRecipes, ku, byIdMap, statsData, streaks, burned, metOf, weightOf, GLASS_ML, WATER_GOAL */

const rep = { file: null, busy: false, msg: '' };

function loadJsZip() {
  if (window.JSZip) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'vendor/jszip.min.js'; s.onload = () => res(); s.onerror = () => rej(new Error('Nie udało się wczytać modułu skoroszytu.'));
    document.head.appendChild(s);
  });
}

const XE = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colL = (n) => { let s = ''; n += 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Style (indeksy cellXfs)
const S = { def: 0, title: 1, sub: 2, head: 3, txt: 4, num: 5, txtZ: 6, numZ: 7, fill: 8, ok: 9, lim: 10, no: 11, label: 12, kpi: 13, unk: 14, dateB: 15, note: 16, numB: 17, dec: 18, kpiDec: 19, decB: 20 };
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts>
<fonts count="7">
<font><sz val="11"/><color rgb="FF3F3D46"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF3F3D46"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="18"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF6A645E"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF2F6B5A"/><name val="Calibri"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF6A645E"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="10">
<fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF2F6B5A"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF3F7D70"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2B3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFDCEFE3"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF8E7C2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF6D5D2"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF7F3EE"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFECE8E3"/></patternFill></fill>
</fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFD9D2C7"/></left><right style="thin"><color rgb="FFD9D2C7"/></right><top style="thin"><color rgb="FFD9D2C7"/></top><bottom style="thin"><color rgb="FFD9D2C7"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="21">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" indent="1"/></xf>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="8" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="1" fontId="0" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="1" fontId="1" fillId="4" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="8" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="1" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="0" fontId="0" fillId="9" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="6" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>
<xf numFmtId="1" fontId="1" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
<xf numFmtId="164" fontId="1" fillId="8" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// Komórka: string, liczba, {f: formuła} albo null. Styl osobno.
function cellXml(ref, v, s) {
  const st = s ? ` s="${s}"` : '';
  if (v === null || v === undefined || v === '') return s ? `<c r="${ref}"${st}/>` : '';
  if (typeof v === 'object' && v.f) return `<c r="${ref}"${st}><f>${XE(v.f)}</f></c>`;
  if (typeof v === 'number' && isFinite(v)) return `<c r="${ref}"${st}><v>${v}</v></c>`;
  return `<c r="${ref}"${st} t="inlineStr"><is><t xml:space="preserve">${XE(v)}</t></is></c>`;
}

// sheet: { name, cols:[szer], rows:[{h, c:[[wartość, styl], ...]}], merges:[], freeze, filter, images:[{row, col, src, w, h}] }
function sheetXml(sh, hasDrawing) {
  const rows = sh.rows.map((r, i) => {
    const n = i + 1;
    const cells = r.c.map((c, j) => (c ? cellXml(colL(j) + n, c[0], c[1]) : '')).join('');
    return `<row r="${n}"${r.h ? ` ht="${r.h}" customHeight="1"` : ''}>${cells}</row>`;
  }).join('');
  const last = colL(sh.cols.length - 1) + Math.max(1, sh.rows.length);
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>' +
    `<dimension ref="A1:${last}"/>` +
    '<sheetViews><sheetView workbookViewId="0" zoomScale="110">' +
    (sh.freeze ? `<pane ySplit="${sh.freeze}" topLeftCell="A${sh.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : '') + '</sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="18"/>' +
    '<cols>' + sh.cols.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' +
    `<sheetData>${rows}</sheetData>` +
    (sh.filter ? `<autoFilter ref="${sh.filter}"/>` : '') +
    (sh.merges && sh.merges.length ? `<mergeCells count="${sh.merges.length}">${sh.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '') +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="0"/>' +
    (hasDrawing ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';
}

function drawingXml(images) {
  const EMU = 9525;
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    images.map((im, i) => `<xdr:oneCellAnchor><xdr:from><xdr:col>${im.col}</xdr:col><xdr:colOff>${6 * EMU}</xdr:colOff><xdr:row>${im.row}</xdr:row><xdr:rowOff>${6 * EMU}</xdr:rowOff></xdr:from>` +
      `<xdr:ext cx="${im.w * EMU}" cy="${im.h * EMU}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${i + 2}" name="Zdjecie ${i + 1}" descr="${XE(im.alt || '')}"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>` +
      `<xdr:blipFill><a:blip r:embed="rId${i + 1}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>` +
      `<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${im.w * EMU}" cy="${im.h * EMU}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`).join('') +
    '</xdr:wsDr>';
}

async function buildXlsx(title, sheets) {
  await loadJsZip();
  const zip = new JSZip();
  const ws = sheets.map((s, i) => ({ ...s, i: i + 1, draw: s.images && s.images.length ? true : false }));
  let ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
    '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>';
  let imgN = 0, drawN = 0;
  for (const s of ws) {
    ct += `<Override PartName="/xl/worksheets/sheet${s.i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    zip.file(`xl/worksheets/sheet${s.i}.xml`, sheetXml(s, s.draw));
    if (s.draw) {
      drawN += 1;
      ct += `<Override PartName="/xl/drawings/drawing${drawN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`;
      zip.file(`xl/worksheets/_rels/sheet${s.i}.xml.rels`, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawN}.xml"/></Relationships>`);
      zip.file(`xl/drawings/drawing${drawN}.xml`, drawingXml(s.images));
      let rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
      s.images.forEach((im, k) => {
        imgN += 1;
        zip.file(`xl/media/image${imgN}.jpeg`, im.src.split(',')[1], { base64: true });
        rels += `<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${imgN}.jpeg"/>`;
      });
      zip.file(`xl/drawings/_rels/drawing${drawN}.xml.rels`, rels + '</Relationships>');
    }
  }
  zip.file('[Content_Types].xml', ct + '</Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>');
  zip.file('docProps/core.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
    `<dc:title>${XE(title)}</dc:title><dc:creator>ZdrowieDietaSport</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`);
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView/></bookViews><sheets>' + ws.map((s) => `<sheet name="${XE(s.name)}" sheetId="${s.i}" r:id="rId${s.i}"/>`).join('') + '</sheets>' +
    (ws.some((s) => s.filter) ? '<definedNames>' + ws.filter((s) => s.filter).map((s) => `<definedName name="_xlnm._FilterDatabase" localSheetId="${s.i - 1}" hidden="1">'${XE(s.name)}'!${s.filter.replace(/([A-Z]+)(\d+)/g, '$$$1$$$2')}</definedName>`).join('') + '</definedNames>' : '') +
    '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    ws.map((s) => `<Relationship Id="rId${s.i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${s.i}.xml"/>`).join('') +
    `<Relationship Id="rId${ws.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', STYLES);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE' });
}

const imgSize = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res([i.naturalWidth || 1, i.naturalHeight || 1]); i.onerror = () => res([4, 3]); i.src = src; });

function rateOf(name) {
  if (!ku || !ku.idx) return ['Spoza listy', S.unk];
  const m = ZdsRecipes.matchRule(ku.idx, name);
  if (!m) return ['Spoza listy', S.unk];
  if (m.amb) return ['Zależy od rodzaju', S.lim];
  return { ok: ['Można', S.ok], lim: ['Z ograniczeniami', S.lim], no: ['Nie można', S.no] }[m.st];
}

// Dane do raportu dla bieżącego profilu i wybranego zakresu dni.
async function reportWorkbook(n) {
  const p = cur(), t = dayKey(), map = typeof byIdMap === 'function' ? byIdMap() : {};
  const days = []; for (let i = n - 1; i >= 0; i--) days.push(ZdsRecipes.dayAfter(t, -i));
  const fmtD = (iso) => `${iso.slice(8)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  const wd = (iso) => new Date(iso + 'T12:00:00').toLocaleDateString('pl-PL', { weekday: 'long' });
  const goal = p.kcal || 0, kg = weightOf(p);
  const period = `${fmtD(days[0])} – ${fmtD(days[days.length - 1])}`;
  const H = (arr) => ({ h: 34, c: arr.map((x) => [x, S.head]) });

  // --- Posiłki (wiersz na danie) ---
  const meals = { name: 'Posiłki', cols: [12, 13, 14, 8, 34, 14, 18, 12, 16, 11, 10], rows: [], freeze: 3, merges: ['A1:K1', 'A2:K2'] };
  meals.rows.push({ h: 30, c: [['Posiłki dzień po dniu', S.title], ...Array(10).fill(['', S.title])] });
  meals.rows.push({ h: 30, c: [['Żółta kolumna: wpisz kalorie, jeśli nie zostały podane (pomogą zdjęcia w zakładce „Zdjęcia”). Do sumy dnia liczą się tylko zjedzone posiłki. Podsumowanie przeliczy się samo.', S.sub]] });
  meals.rows.push(H(['Data', 'Dzień', 'Posiłek', 'Pora', 'Danie', 'Kto wpisał', 'Ocena wg zaleceń', 'Kcal podane', 'Kcal do uzupełnienia', 'Zjedzone', 'Zdjęcia']));
  // --- Zdjęcia ---
  const photos = { name: 'Zdjęcia', cols: [12, 13, 14, 9, 40, 30], rows: [], freeze: 3, merges: ['A1:F1', 'A2:F2'], images: [] };
  photos.rows.push({ h: 30, c: [['Zdjęcia zjedzonych dań', S.title], ...Array(5).fill(['', S.title])] });
  photos.rows.push({ h: 30, c: [['Na ich podstawie oszacuj kalorie i wpisz je w żółtej kolumnie w zakładce „Posiłki”.', S.sub]] });
  photos.rows.push(H(['Data', 'Dzień', 'Posiłek', 'Godzina', 'Co było w posiłku', 'Zdjęcie']));
  // --- Napoje ---
  const drinks = { name: 'Napoje', cols: [12, 13, 30, 10, 18, 14], rows: [], freeze: 2, merges: ['A1:F1'] };
  drinks.rows.push({ h: 30, c: [['Napoje (poza wodą)', S.title], ...Array(5).fill(['', S.title])] });
  drinks.rows.push(H(['Data', 'Dzień', 'Napój', 'ml', 'Ocena wg zaleceń', 'Kto wpisał']));
  // --- Aktywność ---
  const act = { name: 'Aktywność', cols: [12, 13, 28, 10, 10, 18], rows: [], freeze: 3, merges: ['A1:F1', 'C2:F2'] };
  act.rows.push({ h: 30, c: [['Aktywność fizyczna', S.title], ...Array(5).fill(['', S.title])] });
  act.rows.push({ h: 22, c: [['Waga (kg):', S.label], [kg, S.fill], ['← zmień, a spalone kcal przeliczą się same (MET × waga × godziny)', S.note]] });
  act.rows.push(H(['Data', 'Dzień', 'Aktywność', 'Minuty', 'MET', 'Spalone kcal (szac.)']));

  let z = 0;
  for (const iso of days) {
    const d = state.days[iso + '|' + p.id];
    if (!d) continue;
    for (const [mk, mn, hr] of MEALS) {
      const m = d.meals[mk]; if (!m) continue;
      const items = (m.items || []).filter((it) => !it.prop);
      const phs = Array.isArray(m.photos) ? m.photos : m.photo && m.photo.src ? [m.photo] : [];
      const rowsHere = [];
      if (items.length) for (const it of items) rowsHere.push([it.name, it.kid ? p.name : it.by === 'rodzic' ? 'rodzic' : '—', Number(it.kcal) || null]);
      else if (m.done) {
        const pl = state.plan[iso + '|' + mk] || [];
        if (pl.length) for (const e of pl) { const r = e.rid ? map[e.rid] : null; rowsHere.push([(r ? r.name : e.name) + ' (z planu)', 'plan', r ? r.kcal || null : Number(e.kcal) || null]); }
        else rowsHere.push(['(nie wpisano, sprawdź zdjęcie)', '—', null]);
      }
      for (const [nm, who, kc] of rowsHere) {
        const zz = z++ % 2 === 1, [rt, rs] = nm.startsWith('(') ? ['—', S.unk] : rateOf(nm.replace(/ \(z planu\)$/, ''));
        meals.rows.push({ h: 20, c: [[iso, zz ? S.txtZ : S.txt], [wd(iso), zz ? S.txtZ : S.txt], [mn, zz ? S.txtZ : S.txt], [hr, zz ? S.txtZ : S.txt], [nm, zz ? S.txtZ : S.txt],
          [who, zz ? S.txtZ : S.txt], [rt, rs], [kc, zz ? S.numZ : S.num], [kc ? null : '', S.fill], [m.done ? 'tak' : 'nie', m.done ? S.ok : S.unk], [phs.length || '', zz ? S.numZ : S.num]] });
      }
      for (const ph of phs) {
        const [w, h] = await imgSize(ph.src), sc = Math.min(200 / w, 140 / h, 1);
        const r = photos.rows.length;
        photos.rows.push({ h: 115, c: [[iso, S.txt], [wd(iso), S.txt], [mn, S.txt], [ph.at ? new Date(ph.at).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' }) : '', S.txt],
          [rowsHere.map((x) => x[0]).join(', ') || '—', S.txt], ['', S.txt]] });
        photos.images.push({ row: r, col: 5, src: ph.src, w: Math.round(w * sc), h: Math.round(h * sc), alt: `${mn} ${iso}` });
      }
    }
    for (const x of d.drinks || []) {
      const [rt, rs] = rateOf(x.name);
      drinks.rows.push({ h: 20, c: [[iso, S.txt], [wd(iso), S.txt], [x.name, S.txt], [Number(x.ml) || null, S.num], [rt, rs], [x.kid ? p.name : 'rodzic / —', S.txt]] });
    }
    for (const x of d.activities || []) {
      const r = act.rows.length + 1;
      act.rows.push({ h: 20, c: [[iso, S.txt], [wd(iso), S.txt], [x.name, S.txt], [x.min, S.num], [metOf(x.name), S.dec], [{ f: `ROUND(E${r}*$B$2*D${r}/60,0)` }, S.num]] });
    }
  }
  if (meals.rows.length === 3) meals.rows.push({ c: [['Brak wpisów w tym okresie.', S.txt]] });
  if (photos.rows.length === 3) photos.rows.push({ c: [['Brak zdjęć w tym okresie.', S.txt]] });
  if (drinks.rows.length === 2) drinks.rows.push({ c: [['Brak napojów w tym okresie.', S.txt]] });
  if (act.rows.length === 3) act.rows.push({ c: [['Brak aktywności w tym okresie.', S.txt]] });
  meals.filter = `A3:K${meals.rows.length}`;

  // --- Podsumowanie ---
  const rows = statsData(p.id, n), used = rows.filter((r) => r.has), nn = used.length || 1, s = streaks(rows);
  const sum = { name: 'Podsumowanie', cols: [13, 13, 12, 12, 13, 12, 10, 10, 11, 13, 11], rows: [], merges: ['A1:K1', 'A2:K2', 'A3:K3'] };
  sum.rows.push({ h: 38, c: [[`Raport diety: ${p.name}`, S.title], ...Array(10).fill(['', S.title])] });
  sum.rows.push({ h: 20, c: [[`Okres: ${period}  ·  cel: ${goal ? goal + ' kcal dziennie' : 'nie ustawiono'}  ·  wygenerowano ${new Date().toLocaleString('pl-PL')}`, S.sub]] });
  sum.rows.push({ h: 18, c: [['Zalecenia: dietetyk LUX MED · 5 posiłków co 3,5–4 h · 2 l wody · owoce do 16:00. Kalorie liczą się z posiłków oznaczonych jako zjedzone, uzupełnij brakujące w zakładce „Posiłki”.', S.note]] });
  sum.rows.push({ c: [] });
  const k = (l, v, st = S.kpi) => [[l, S.label], [v, st]];
  const dataStart = 13, dataEnd = dataStart + days.length - 1;
  sum.rows.push({ h: 26, c: [...k('Śr. kcal dziennie', { f: `IFERROR(AVERAGEIF(F${dataStart}:F${dataEnd},">0"),0)` }), ['', 0], ...k('Seria zgodnych dni', s.curr), ['', 0], ...k('Najdłuższa seria', s.best)] });
  sum.rows.push({ h: 26, c: [...k('Posiłki zjedzone', `${used.reduce((a, r) => a + r.done, 0)} z ${used.length * MEALS.length}`), ['', 0], ...k('Woda średnio (l)', Number((used.reduce((a, r) => a + r.water, 0) / nn / 1000).toFixed(1)), S.kpiDec), ['', 0], ...k('Dni z 2 l wody', used.filter((r) => r.water >= WATER_GOAL * GLASS_ML).length)] });
  sum.rows.push({ h: 26, c: [...k('Aktywność (min)', rows.reduce((a, r) => a + r.act, 0)), ['', 0], ...k('Spalone kcal (szac.)', { f: `IFERROR(SUM(J${dataStart}:J${dataEnd}),0)` }), ['', 0], ...k('Wpisy syna', rows.reduce((a, r) => a + r.kid, 0))] });
  const q = rows.reduce((a, r) => ({ ok: a.ok + r.ok, lim: a.lim + r.lim, no: a.no + r.no, unk: a.unk + r.unk }), { ok: 0, lim: 0, no: 0, unk: 0 });
  sum.rows.push({ h: 26, c: [['Dozwolone', S.label], [q.ok, S.ok], ['', 0], ['Ograniczone', S.label], [q.lim, S.lim], ['', 0], ['Zakazane', S.label], [q.no, S.no], ['', 0], ['Spoza listy', S.label], [q.unk, S.unk]] });
  const bad = [...new Set(rows.flatMap((r) => r.bad))];
  sum.rows.push({ h: 20, c: [[bad.length ? 'Zakazane w tym okresie: ' + bad.join(', ') : 'W tym okresie nie było zakazanych produktów.', bad.length ? S.no : S.ok]] });
  sum.merges.push('A9:K9');
  sum.rows.push({ c: [] }, { c: [] });
  sum.rows.push(H(['Data', 'Dzień', 'Posiłki (z 5)', 'Kcal podane', 'Kcal uzupełnione', 'Kcal razem', 'Cel', 'Woda (l)', 'Ruch (min)', 'Spalone kcal (szac.)', 'Dzień zgodny']));
  days.forEach((iso, i) => {
    const r = rows[i], R = dataStart + i, zz = i % 2 === 1;
    const kc = { f: `SUMIFS('Posiłki'!H:H,'Posiłki'!A:A,A${R},'Posiłki'!J:J,"tak")` }, kf = { f: `SUMIFS('Posiłki'!I:I,'Posiłki'!A:A,A${R},'Posiłki'!J:J,"tak")` };
    sum.rows.push({ h: 20, c: [[iso, S.dateB], [wd(iso), zz ? S.txtZ : S.txt], [r.done, zz ? S.numZ : S.num], [kc, zz ? S.numZ : S.num], [kf, S.fill], [{ f: `D${R}+E${R}` }, S.numB],
      [goal || '', zz ? S.numZ : S.num], [Number((r.water / 1000).toFixed(1)), S.dec], [r.act, zz ? S.numZ : S.num], [{ f: `SUMIFS('Aktywność'!F:F,'Aktywność'!A:A,A${R})` }, zz ? S.numZ : S.num],
      [r.good ? 'tak' : r.has ? 'nie' : '—', r.good ? S.ok : r.has ? S.lim : S.unk]] });
  });
  const T = dataEnd + 1;
  sum.rows.push({ h: 22, c: [['Razem / średnio', S.label], ['', S.label], [{ f: `SUM(C${dataStart}:C${dataEnd})` }, S.numB], [{ f: `SUM(D${dataStart}:D${dataEnd})` }, S.numB], [{ f: `SUM(E${dataStart}:E${dataEnd})` }, S.numB],
    [{ f: `SUM(F${dataStart}:F${dataEnd})` }, S.numB], ['', S.label], [{ f: `ROUND(AVERAGE(H${dataStart}:H${dataEnd}),1)` }, S.decB], [{ f: `SUM(I${dataStart}:I${dataEnd})` }, S.numB],
    [{ f: `SUM(J${dataStart}:J${dataEnd})` }, S.numB], [{ f: `COUNTIF(K${dataStart}:K${dataEnd},"tak")&" dni"` }, S.numB]] });
  sum.merges.push(`A${T}:B${T}`);
  sum.freeze = 0;

  const title = `Raport diety ${p.name} ${period}`;
  const blob = await buildXlsx(title, [sum, meals, photos, drinks, act]);
  const fname = `raport-diety-${p.name.toLowerCase().replace(/\s+/g, '-')}-${days[0]}_${days[days.length - 1]}.xlsx`;
  return new File([blob], fname, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

// Krok 1: przygotuj (to trwa), krok 2: wyślij (iPhone wymaga, żeby udostępnianie było od razu po dotknięciu).
async function reportPrepare() {
  if (rep.busy) return;
  rep.busy = true; rep.file = null; rep.msg = 'Przygotowuję raport…'; render();
  try {
    rep.file = await reportWorkbook(st.range);
    rep.msg = `Raport gotowy: ${rep.file.name} (${Math.max(1, Math.round(rep.file.size / 1024))} KB).`;
  } catch (e) { rep.msg = 'Nie udało się przygotować raportu: ' + (e.message || e); }
  rep.busy = false; render();
}
async function reportSend() {
  const f = rep.file; if (!f) return;
  const to = (document.getElementById('smail') || {}).value || state.statsMail || '';
  if (to && navigator.clipboard) navigator.clipboard.writeText(to).catch(() => {});
  if (navigator.canShare && navigator.canShare({ files: [f] })) {
    try { await navigator.share({ files: [f], title: 'Raport diety', text: `Raport diety (${cur().name})${to ? ' dla ' + to : ''}` }); return; } catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(f); a.download = f.name;
  document.body.appendChild(a); a.click(); a.remove();
  rep.msg = `Zapisano ${f.name}. Dołącz plik do maila${to ? ' do ' + to : ''}.`; render();
}

if (typeof module !== 'undefined') module.exports = { colL, cellXml, sheetXml, drawingXml, XE };
