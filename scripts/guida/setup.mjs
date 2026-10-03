import { execFileSync } from "node:child_process";
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import { WORK } from "./work.mjs";
const DB = (sql) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-Atc", sql], { env: { ...process.env, PGPASSWORD: "orari" }, maxBuffer: 1 << 28 }).toString().trim();
const DBF = (file) => execFileSync("psql", ["-h", "localhost", "-U", "orari", "orari_test", "-f", file], { env: { ...process.env, PGPASSWORD: "orari" }, maxBuffer: 1 << 28 });
const today = DB(`select to_char((now() at time zone 'Europe/Rome') - interval '5 hours','YYYY-MM-DD')`);
const plus = (n) => DB(`select to_char(('${today}'::date + ${n}),'YYYY-MM-DD')`);

DB(`delete from "MenuPromo"`);
DB(`delete from "MenuChange"`);
DB(`delete from "MenuItem" where "groupId" in ('menu_grp_oggi_piatti','menu_grp_oggi_vini')`);
DB(`update "MenuItem" set "soldOutDay"=null, "deletedAt"=null`);
DB(`delete from "MenuItem" where name like 'Vino %'`);
DB(`update "MenuItem" set "allergensReviewed"=true where "groupId" in (select g.id from "MenuGroup" g join "MenuSection" s on s.id=g."sectionId" where s.kind='FOOD')`);

const poster = (title, sub, line3, c1) => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1125"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="#2a0510"/></linearGradient></defs><rect width="900" height="1125" fill="url(#g)"/><rect x="40" y="40" width="820" height="1045" fill="none" stroke="#C9A96E" stroke-width="3"/><text x="450" y="260" font-family="serif" font-size="44" fill="#E3D4BC" text-anchor="middle" letter-spacing="10">${sub}</text><text x="450" y="520" font-family="serif" font-style="italic" font-size="${Math.min(150, Math.floor(1500 / title.length))}" fill="#F4EEE3" text-anchor="middle">${title}</text><line x1="300" y1="590" x2="600" y2="590" stroke="#C9A96E" stroke-width="3"/><text x="450" y="700" font-family="serif" font-size="52" fill="#F4EEE3" text-anchor="middle">${line3}</text><text x="450" y="1010" font-family="serif" font-size="34" fill="#C9A96E" text-anchor="middle" letter-spacing="6">L'ANGOLO DEL VINO</text></svg>`;

async function addPromo({ id, slug, title, label, body, showFrom, start, end, kind, c1, line3, items, image }) {
  const jpg = image ? await sharp(image).resize({ width: 900 }).jpeg({ quality: 84 }).toBuffer() : await sharp(Buffer.from(poster(title, (label || "").toUpperCase(), line3, c1))).jpeg({ quality: 80 }).toBuffer();
  const meta = await sharp(jpg).metadata();
  DB(`insert into "MenuPromo" ("id","kind","slug","title","label","body","showFrom","startDate","endDate","hidden","imageUpdatedAt","imageWidth","imageHeight","updatedAt") values ('${id}','${kind}','${slug}','${title}','${label}','${body}','${showFrom}','${start}','${end}',false,now(),${meta.width},${meta.height},now())`);
  writeFileSync(`${WORK}/${id}.sql`, `insert into "MenuPromoImage" ("promoId","data","mimeType","updatedAt") values ('${id}', decode('${jpg.toString("hex")}','hex'), 'image/jpeg', now());`);
  DBF(`${WORK}/${id}.sql`);
  if (kind === "EVENT") {
    DB(`insert into "MenuSection" ("id","slug","label","kicker","title","kind","sortOrder","promoId") values ('${id}_sec','evento-${id}','${title}','Evento','${title}','FOOD',100,'${id}')`);
    DB(`insert into "MenuGroup" ("id","sectionId","title","columns","sortOrder") values ('${id}_g1','${id}_sec','Da bere',false,0),('${id}_g2','${id}_sec','Da mangiare',false,1)`);
    let n = 0;
    for (const [g, name, desc, cents, allergens] of items) {
      DB(`insert into "MenuItem" ("id","groupId","name","description","priceCents","allergens","allergensReviewed","sortOrder","updatedAt") values ('${id}_i${n}','${id}_g${g}','${name}','${desc}',${cents},'{${allergens}}',true,${n++},now())`);
    }
  }
}
const UP = new URL("./assets/", import.meta.url).pathname;
await addPromo({ id: "demo_jazz", slug: "crudite-champagne", title: "Crudité & Champagne", label: "Serata con il produttore", body: "Crudo di pesce e ostriche, con la partecipazione di Champagne Pierre Legras: sarà presente il produttore. Info e prenotazioni: 338 327 7053.", showFrom: plus(-3), start: today, end: today, kind: "EVENT", c1: "#6B1020", line3: "", image: UP + "locandina-crudite.png", items: [[1, "Calice di Champagne Pierre Legras", "Selezione del produttore", 1200, "SOLFITI"], [2, "Ostriche (3 pezzi)", "Con limone", 1800, "MOLLUSCHI"], [2, "Crudo di pesce", "Selezione del giorno", 2200, "PESCE"]] });
await addPromo({ id: "demo_degust", slug: "oktoberfest", title: "Oktoberfest", label: "Birre, cibo e musica", body: "Birre, cibo e musica bavarese. Posti limitati, si consiglia la prenotazione: 338 327 7053.", showFrom: today, start: plus(8), end: plus(9), kind: "EVENT", c1: "#4A0A15", line3: "", image: UP + "locandina-oktoberfest.png", items: [[1, "Birra alla spina", "Boccale da 0,5 l", 600, "GLUTINE"], [2, "Brezel bavarese", "Con burro e sale", 500, "GLUTINE,LATTE"]] });
// Oggi fuori menù
DB(`insert into "MenuItem" ("id","groupId","name","description","priceCents","allergens","allergensReviewed","onlyDay","sortOrder","updatedAt") values ('demo_d1','menu_grp_oggi_piatti','Risotto ai porcini','Riso carnaroli, porcini, parmigiano',1400,'{LATTE}',true,'${today}',0,now())`);
DB(`insert into "MenuItem" ("id","groupId","name","sub","priceGlassCents","priceBottleCents","region","country","onlyDay","sortOrder","updatedAt") values ('demo_d2','menu_grp_oggi_vini','Vermentino di Gallura','Superiore 2023',800,3500,'Sardegna','Italia','${today}',0,now())`);
// Un vino con regione e nazione
DB(`update "MenuItem" set country=null where country='Italia'`);
// Abbinamenti consigliati
DB(`update "MenuItem" set "pairWineId"=null`);
DB(`update "MenuItem" set "pairWineId"=(select id from "MenuItem" where name='Mastrojanni' and "groupId"='menu_grp_3_1' and "deletedAt" is null limit 1) where name='Tagliere Classico' and "deletedAt" is null`);
DB(`update "MenuItem" set "pairWineId"=(select id from "MenuItem" where name='Revì' and "deletedAt" is null limit 1) where name='Tagliere Premium' and "deletedAt" is null`);
DB(`update "MenuBlock" set "priceCents"=100 where kind='PRICE' and label='Coperto'`);
// Caratteristiche dei vini (come la migrazione in produzione)
DB(`update "MenuItem" set traits='{}'`);
DBF(new URL("../../prisma/", import.meta.url).pathname + "migrations/20261009100000_menu_wine_traits_fill/migration.sql");
// Statistiche di esempio: dieci settimane di aperture, più ricerche e tocchi
const since = plus(-69);
DB(`delete from "MenuEvent"`);
DB(`insert into "MenuSetting"(id, value) values ('stats', '{"enabled":true,"since":"${since}"}') on conflict (id) do update set value=excluded.value`);
DB(`select setseed(0.42)`);
DB(`insert into "MenuEvent"(id, day, hour, weekday, kind)
  select md5(random()::text || d::text || h::text || n::text), to_char(d,'YYYY-MM-DD'), h, extract(isodow from d)::int, 'open'
  from generate_series('${since}'::date, '${today}'::date, interval '1 day') d
  cross join generate_series(16, 23) h cross join generate_series(1, 30) n
  where n <= round((case extract(isodow from d)::int when 1 then 0.4 when 2 then 2 when 3 then 2.6 when 4 then 3.4 when 5 then 6.5 when 6 then 8 else 4.2 end)
    * (case h when 16 then .2 when 17 then .5 when 18 then .9 when 19 then 1.3 when 20 then 1.5 when 21 then 1.1 when 22 then .6 else .25 end)
    * (0.55 + random() * 0.9) * (0.8 + (d::date - '${since}'::date) / 160.0))`);
const ev = (kind, label, n) => DB(`insert into "MenuEvent"(id, day, hour, weekday, kind, label) select md5(random()::text || g::text), to_char(d,'YYYY-MM-DD'), 19 + (g % 4), extract(isodow from d)::int, '${kind}', '${label}' from generate_series(1, ${n}) g, lateral (select '${since}'::date + (random() * 69)::int as d) x`);
for (const [l, n] of [["sangiovese", 31], ["champagne", 24], ["tartare", 19], ["vegano", 14], ["bollicine", 12], ["gewürztraminer", 9], ["tagliere", 8]]) ev("search", l, n);
for (const [l, n] of [["prosecco", 11], ["senza glutine", 7], ["birra", 5], ["spritz", 4]]) ev("search_empty", l, n);
for (const [l, n] of [["Henriot · Brut Souverain", 22], ["Avignonesi · Da-Di", 17], ["Tartare Classica", 15], ["Tagliere Premium", 12]]) ev("pick", l, n);
for (const [l, n] of [["Mastrojanni", 16], ["Revì · Brut Millesimato", 9]]) ev("pair", l, n);
for (const [l, n] of [["Rossi", 96], ["Bollicine", 81], ["Taglieri & Pinse", 74], ["Bianchi", 58], ["Tartare", 41], ["Rosé & Orange", 33]]) ev("section", l, n);
for (const [l, n] of [["Oktoberfest", 27], ["Crudité & Champagne", 21]]) ev("event", l, n);
for (const [l, n] of [["WhatsApp", 18], ["Chiama", 11], ["Indicazioni", 9], ["Instagram", 7], ["Recensione", 3]]) ev("contact", l, n);
console.log("demo pronta", today);
