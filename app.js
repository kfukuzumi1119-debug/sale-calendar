// ネット通販セール暦
// data/sales.json と data/meta.json を読んで表示するだけ。データは毎週金曜の夜に書き換わる。

// アフィリエイトの設定。ID を入れると、その店へのリンクがすべて切り替わる（空なら普通のリンク）
const AFF = {
  amazonTag: "",     // Amazon アソシエイトのトラッキングID（例: xxxx-22）
  rakutenId: ""      // 楽天アフィリエイトID（例: 1a2b3c4d.5e6f7a8b.1a2b3c4d.5e6f7a8b）
};

const SHOP_NAME = {
  amazon: "Amazon", rakuten: "楽天市場", yahoo: "Yahoo!ショッピング",
  aupay: "au PAY マーケット", qoo10: "Qoo10", lohaco: "LOHACO", other: "その他"
};
const WD = ["日", "月", "火", "水", "木", "金", "土"];
const DAY = 86400000;

function jst(s) { return new Date(s + ":00+09:00"); }
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// 日本時間での年月日・曜日・時刻
function parts(d) {
  const t = new Date(d.getTime() + 9 * 3600000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(), w: t.getUTCDay(), h: t.getUTCHours(), mi: t.getUTCMinutes() };
}
function dayKey(d) { const p = parts(d); return Date.UTC(p.y, p.m - 1, p.d); }
function fmtDate(d) { const p = parts(d); return `${p.m}/${p.d}（${WD[p.w]}）`; }
function fmtTime(d) { const p = parts(d); return `${p.h}:${String(p.mi).padStart(2, "0")}`; }
function fmtRange(s) {
  return `${fmtDate(s.s)} ${fmtTime(s.s)} 〜 ${fmtDate(s.e)} ${fmtTime(s.e)}`;
}

function link(url, shop) {
  if (!url) return "#";
  if (shop === "amazon" && AFF.amazonTag) {
    const u = new URL(url); u.searchParams.set("tag", AFF.amazonTag); return u.toString();
  }
  if (shop === "rakuten" && AFF.rakutenId) {
    return `https://hb.afl.rakuten.co.jp/hgc/${AFF.rakutenId}/?pc=${encodeURIComponent(url)}`;
  }
  return url;
}
// カレンダーに入れる
function zt(d) { return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); }
function calText(s) {
  const pred = s.status === "predicted";
  return {
    title: "【セール】" + s.title + (s.off ? "　" + s.off : "") + (pred ? "（予想）" : ""),
    details: [s.shopName || SHOP_NAME[s.shop] || "", pred ? "※日程は未発表。" + (s.dateNote || "") : "", s.summary || "",
      s.entry ? "エントリー：" + s.entry : "", ...(s.tips || []).map(t => "★" + t), "公式：" + (s.url || ""),
      location.origin + location.pathname + "#" + s.id].filter(Boolean).join("\n")
  };
}
function gcalUrl(s) {
  const c = calText(s);
  const q = new URLSearchParams({ action: "TEMPLATE", text: c.title, dates: `${zt(s.s)}/${zt(new Date(s.e.getTime() + 60000))}`, details: c.details, ctz: "Asia/Tokyo" });
  return "https://calendar.google.com/calendar/render?" + q.toString();
}
function icsEsc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
function icsFold(line) {
  const enc = new TextEncoder(); const out = []; let cur = ""; let n = 0;
  for (const ch of line) {
    const b = enc.encode(ch).length;
    if (n + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; n = 0; }
    cur += ch; n += b;
  }
  out.push(cur);
  return out.join("\r\n ");
}
function downloadIcs(s) {
  const c = calText(s);
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//sale-calendar//JA", "BEGIN:VEVENT",
    `UID:${s.id}@sale-calendar`, `DTSTAMP:${zt(new Date())}`, `DTSTART:${zt(s.s)}`, `DTEND:${zt(new Date(s.e.getTime() + 60000))}`,
    `SUMMARY:${icsEsc(c.title)}`, `DESCRIPTION:${icsEsc(c.details)}`, `URL:${s.url || ""}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H", `DESCRIPTION:${icsEsc(s.title + " がまもなく始まります")}`, "END:VALARM",
    "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER;RELATED=END:-PT3H", `DESCRIPTION:${icsEsc(s.title + " はあと3時間で終わります")}`, "END:VALARM",
    "END:VEVENT", "END:VCALENDAR"];
  const blob = new Blob([L.map(icsFold).join("\r\n") + "\r\n"], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob); a.download = `${s.id}.ics`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function shopTag(s, name) { return `<span class="shop" data-s="${esc(s)}">${esc(name || SHOP_NAME[s] || s)}</span>`; }

// 開催中・これからの状態
function state(s, now) {
  if (now > s.e) return { k: "ended" };
  if (now >= s.s) {
    const days = Math.round((dayKey(s.e) - dayKey(now)) / DAY);
    return { k: "now", days };
  }
  const days = Math.round((dayKey(s.s) - dayKey(now)) / DAY);
  return { k: "soon", days };
}

function countHTML(st) {
  if (st.k === "now") {
    if (st.days <= 0) return `<span class="num today">今日まで</span>`;
    return `<span class="pre">残り</span><span class="num">${st.days}</span><span class="unit">日</span>`;
  }
  if (st.days <= 0) return `<span class="num today">今日から</span>`;
  if (st.days === 1) return `<span class="num today">明日から</span>`;
  return `<span class="pre">あと</span><span class="num">${st.days}</span><span class="unit">日</span>`;
}

function tile(s, st) {
  const pred = s.status === "predicted";
  const when = st.k === "now" ? `${fmtDate(s.e)} ${fmtTime(s.e)} まで` : `${fmtDate(s.s)} ${fmtTime(s.s)} から`;
  return `<a class="tile${pred ? " predicted" : ""}" href="#${esc(s.id)}">
    ${pred ? '<span class="stamp">予想</span>' : ""}
    ${shopTag(s.shop, s.shopName)}
    <span class="tile-title">${esc(s.title)}</span>
    ${s.off ? `<span class="off">${esc(s.off)}</span>` : ""}
    <span class="tile-count">${countHTML(st)}</span>
    <span class="tile-when">${when}${pred ? "（見込み）" : ""}</span>
    ${pred ? `<span class="tile-pnote">日程は未発表。${esc(s.announce || "過去の開催からの見込みです")}</span>` : ""}
  </a>`;
}

function card(s, st) {
  const pred = s.status === "predicted";
  let stateText = "";
  if (st.k === "now") stateText = st.days <= 0 ? "<b>今日まで</b>" : `開催中・残り<b>${st.days}</b>日`;
  else if (st.k === "soon") stateText = st.days <= 0 ? "<b>今日から</b>" : `あと<b>${st.days}</b>日で開始`;
  else stateText = "終了";
  return `<article class="sale${pred ? " predicted" : ""}${st.k === "ended" ? " ended" : ""}" id="${esc(s.id)}">
    <div class="sale-side">
      ${shopTag(s.shop, s.shopName)}
      <div class="sale-date">${fmtDate(s.s)}<small>${fmtTime(s.s)} から</small>${fmtDate(s.e)}<small>${fmtTime(s.e)} まで</small></div>
      <div class="sale-state">${stateText}</div>
    </div>
    <div class="sale-main">
      <h3>${esc(s.title)}${s.off ? `<span class="off off-h">${esc(s.off)}</span>` : ""}${pred ? '<span class="yoso">予想</span>' : ""}</h3>
      ${s.dateNote ? `<p class="sale-note">${esc(s.dateNote)}</p>` : ""}
      <p class="sale-sum">${esc(s.summary)}</p>
      ${s.entry ? `<p class="sale-entry">エントリー：<b>${esc(s.entry)}</b></p>` : ""}
      ${s.tips && s.tips.length ? `<p class="tips-h">お得に買うコツ</p><ul class="tips">${s.tips.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : ""}
      <div class="sale-foot">
        <a class="btn" href="${esc(link(s.url, s.shop))}" target="_blank" rel="noopener sponsored">公式ページを見る</a>
        <span class="cal">カレンダーに入れる：
          <a href="${esc(gcalUrl(s))}" target="_blank" rel="noopener">Google</a>
          <button type="button" data-ics="${esc(s.id)}">iPhone・その他</button></span>
        ${s.source ? `<span class="src">情報元：${esc(s.source)}</span>` : ""}
      </div>
    </div>
  </article>`;
}

function timeline(sales, now) {
  const el = document.getElementById("timeline");
  const cw = window.matchMedia("(max-width: 640px)").matches ? 26 : 30;
  // 今週の月曜から7週間
  const p = parts(now);
  const back = (p.w + 6) % 7;
  const startKey = Date.UTC(p.y, p.m - 1, p.d) - back * DAY;
  const N = 49;
  const endKey = startKey + (N - 1) * DAY;
  // 大手モールを上に、その中は始まる順
  const rows = sales.filter(s => dayKey(s.e) >= startKey && dayKey(s.s) <= endKey)
    .sort((a, b) => (a.cat !== "mall") - (b.cat !== "mall") || a.s - b.s);

  el.style.gridTemplateColumns = `auto repeat(${N}, ${cw}px)`;
  el.style.gridTemplateRows = `auto auto repeat(${rows.length}, 40px)`;
  let h = "";
  // 月の見出し
  h += `<div class="tl-label" style="grid-row:1 / span 2;grid-column:1;border-bottom:2px solid #1a1a1a">セール</div>`;
  let i = 0;
  while (i < N) {
    const d = new Date(startKey + i * DAY);
    const m = d.getUTCMonth();
    let j = i;
    while (j < N && new Date(startKey + j * DAY).getUTCMonth() === m) j++;
    h += `<div class="tl-month" style="grid-row:1;grid-column:${i + 2} / ${j + 2}">${d.getUTCFullYear()}年${m + 1}月</div>`;
    i = j;
  }
  for (let k = 0; k < N; k++) {
    const d = new Date(startKey + k * DAY);
    const w = d.getUTCDay();
    const cls = ["tl-head", w === 6 ? "sat" : "", w === 0 ? "sun" : "", d.getUTCDate() === 1 ? "mon1" : ""].join(" ");
    h += `<div class="${cls}" style="grid-row:2;grid-column:${k + 2}">${d.getUTCDate()}<br>${WD[w]}</div>`;
  }
  rows.forEach((s, r) => {
    const row = r + 3;
    h += `<div class="tl-label" style="grid-row:${row};grid-column:1">${shopTag(s.shop, s.shopName)}<span>${esc(s.title.replace(/^(Amazon|au PAY マーケット|Yahoo!ショッピング|Qoo10)\s*/, ""))}</span></div>`;
    h += `<div class="tl-row-bg" style="grid-row:${row};grid-column:2 / ${N + 2}"></div>`;
    const a = Math.max(0, Math.round((dayKey(s.s) - startKey) / DAY));
    const b = Math.min(N - 1, Math.round((dayKey(s.e) - startKey) / DAY));
    const pred = s.status === "predicted";
    const cut = dayKey(s.s) < startKey;
    h += `<a class="tl-bar${pred ? " p" : ""}${cut ? " cut" : ""}" data-s="${esc(s.shop)}" href="#${esc(s.id)}" style="grid-row:${row};grid-column:${a + 2} / ${b + 3}" title="${esc(s.title)}　${esc(fmtRange(s))}">${esc(fmtDate(s.s).replace(/（.）/, ""))}〜${esc(fmtDate(s.e).replace(/（.）/, ""))}${s.off ? " " + esc(s.off) : ""}${pred ? " 予想" : ""}</a>`;
  });
  const t = Math.round((dayKey(now) - startKey) / DAY);
  h += `<div class="tl-today" style="grid-row:2 / ${rows.length + 3};grid-column:${t + 2}"></div>`;
  el.innerHTML = h;
}

async function main() {
  const [sales, meta] = await Promise.all([
    fetch("data/sales.json", { cache: "no-cache" }).then(r => r.json()),
    fetch("data/meta.json", { cache: "no-cache" }).then(r => r.json())
  ]);
  const now = new Date();
  const list = sales.map(x => ({ ...x, s: jst(x.start), e: jst(x.end) }))
    .sort((a, b) => a.s - b.s || a.e - b.e);
  const withSt = list.map(s => ({ s, st: state(s, now) }));

  // 更新号
  const u = jst(meta.updatedAt + "T00:00");
  const up = parts(u);
  document.getElementById("issue").textContent = `${up.y}年${up.m}月${up.d}日（${WD[up.w]}）`;

  // 絞り込み（大手モール・家電・暮らし・ファッション）
  const CATS = [["all", "すべて"], ["mall", "大手モール"], ["kaden", "家電"], ["life", "暮らし・子ども"], ["fashion", "ファッション・百貨店"]];
  let cat = "all";
  try { const v = localStorage.getItem("sale-cat"); if (CATS.some(c => c[0] === v)) cat = v; } catch (e) {}
  const filt = document.getElementById("filter");

  function render() {
    filt.innerHTML = CATS.map(([k, label]) => {
      const n = withSt.filter(x => x.st.k !== "ended" && (k === "all" || x.s.cat === k)).length;
      return `<button type="button" data-k="${k}" aria-pressed="${k === cat}">${label}<span>${n}</span></button>`;
    }).join("");
    const hit = x => cat === "all" || x.s.cat === cat;
    const nowItems = withSt.filter(x => x.st.k === "now" && hit(x)).sort((a, b) => a.s.e - b.s.e);
    const soonItems = withSt.filter(x => x.st.k === "soon" && x.st.days <= 31 && hit(x));
    document.getElementById("now").innerHTML = nowItems.length
      ? nowItems.map(x => tile(x.s, x.st)).join("")
      : `<div class="empty">この分類で開催中のセールはありません。</div>`;
    document.getElementById("soon").innerHTML = soonItems.length
      ? soonItems.map(x => tile(x.s, x.st)).join("")
      : `<div class="empty">1か月以内に始まる予定のセールはまだ発表されていません。</div>`;
    timeline(list.filter(s => hit({ s }) && (state(s, now).k !== "ended" || now - s.e < 7 * DAY)), now);
    document.getElementById("list").innerHTML = withSt
      .filter(x => x.st.k !== "ended" && hit(x))
      .sort((a, b) => (a.s.cat !== "mall") - (b.s.cat !== "mall") || a.s.s - b.s.s)
      .map(x => card(x.s, x.st)).join("");
  }
  filt.addEventListener("click", ev => {
    const b = ev.target.closest("button");
    if (!b) return;
    cat = b.dataset.k;
    try { localStorage.setItem("sale-cat", cat); } catch (e) {}
    render();
  });
  render();
  document.getElementById("list").addEventListener("click", ev => {
    const b = ev.target.closest("button[data-ics]");
    if (!b) return;
    const s = list.find(x => x.id === b.dataset.ics);
    if (s) downloadIcs(s);
  });

  // 購読リンク
  const feed = new URL("calendar.ics", location.href);
  const webcal = "webcal://" + feed.host + feed.pathname;
  document.getElementById("sub-apple").href = webcal;
  document.getElementById("sub-google").href = "https://calendar.google.com/calendar/render?cid=" + encodeURIComponent(webcal);
  document.getElementById("sub-url").value = feed.href;
  document.getElementById("sub-copy").addEventListener("click", async () => {
    const inp = document.getElementById("sub-url");
    try { await navigator.clipboard.writeText(inp.value); } catch (e) { inp.select(); document.execCommand("copy"); }
    document.getElementById("sub-copy").textContent = "コピーしました";
  });

  document.getElementById("monthly").innerHTML = (meta.monthly || []).map(m =>
    `<li>${shopTag(m.shop)}<span class="m-title">${esc(m.title)}</span><span class="m-days">${esc(m.days)}</span><span class="m-note">${esc(m.note)}</span></li>`
  ).join("");
}

main().catch(err => {
  console.error(err);
  document.getElementById("now").innerHTML = `<div class="empty">データを読み込めませんでした。時間をおいて開き直してください。</div>`;
});
