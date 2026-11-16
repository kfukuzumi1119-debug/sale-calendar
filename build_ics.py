# data/sales.json から購読用カレンダー calendar.ics を作る（Python 標準ライブラリだけ）
# 使い方: python build_ics.py
import json, os
from datetime import datetime, timedelta, timezone

HERE = os.path.dirname(os.path.abspath(__file__))
JST = timezone(timedelta(hours=9))
SITE = "https://sale.hibitool.com/"
SHOP = {"amazon": "Amazon", "rakuten": "楽天市場", "yahoo": "Yahoo!ショッピング",
        "aupay": "au PAY マーケット", "qoo10": "Qoo10", "lohaco": "LOHACO"}


def t(s):
    return datetime.strptime(s, "%Y-%m-%dT%H:%M").replace(tzinfo=JST)


def z(d):
    return d.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def esc(s):
    return str(s or "").replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def fold(line):
    # 1行75バイトまで（UTF-8 の文字の途中で切らない）
    out, cur = [], b""
    for ch in line:
        b = ch.encode("utf-8")
        if len(cur) + len(b) > (75 if not out else 74):
            out.append(cur)
            cur = b""
        cur += b
    out.append(cur)
    return "\r\n ".join(x.decode("utf-8") for x in out)


def main():
    with open(os.path.join(HERE, "data", "sales.json"), encoding="utf-8") as f:
        sales = json.load(f)
    now = datetime.now(timezone.utc)
    stamp = z(now)
    L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//sale-calendar//JA", "CALSCALE:GREGORIAN",
         "METHOD:PUBLISH", "X-WR-CALNAME:ネット通販セール暦", "X-WR-TIMEZONE:Asia/Tokyo",
         "REFRESH-INTERVAL;VALUE=DURATION:PT12H", "X-PUBLISHED-TTL:PT12H"]
    for s in sales:
        start, end = t(s["start"]), t(s["end"])
        if end < now - timedelta(days=30):
            continue
        pred = s.get("status") == "predicted"
        shop = s.get("shopName") or SHOP.get(s["shop"], "")
        title = s["title"] + ("　" + s["off"] if s.get("off") else "") + ("（予想）" if pred else "")
        desc = [shop]
        if pred:
            desc.append("※日程は未発表。" + (s.get("dateNote") or ""))
        desc.append(s.get("summary", ""))
        if s.get("entry"):
            desc.append("エントリー：" + s["entry"])
        for tip in s.get("tips") or []:
            desc.append("★" + tip)
        desc.append("公式：" + s.get("url", ""))
        desc.append("ネット通販セール暦：" + SITE + "#" + s["id"])
        ev = [
            ("UID", s["id"] + "@sale-calendar"),
            ("DTSTAMP", stamp),
            ("DTSTART", z(start)),
            ("DTEND", z(end + timedelta(minutes=1))),
            ("SUMMARY", esc("【セール】" + title)),
            ("DESCRIPTION", esc("\n".join(desc))),
            ("URL", s.get("url", "")),
        ]
        L.append("BEGIN:VEVENT")
        L += [f"{k}:{v}" for k, v in ev]
        L += ["BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:-PT1H", "DESCRIPTION:" + esc(title + " がまもなく始まります"), "END:VALARM"]
        L.append("END:VEVENT")
        # 終わる3時間前のお知らせ（確定しているセールだけ）
        if not pred:
            last = end - timedelta(hours=3)
            L += ["BEGIN:VEVENT", "UID:" + s["id"] + "-end@sale-calendar", "DTSTAMP:" + stamp,
                  "DTSTART:" + z(last), "DTEND:" + z(last + timedelta(minutes=30)),
                  "SUMMARY:" + esc("【まもなく終了】" + title),
                  "DESCRIPTION:" + esc(f"{end.month}/{end.day} {end.hour}:{end.minute:02d} に終わります。\n" + SITE + "#" + s["id"]),
                  "BEGIN:VALARM", "ACTION:DISPLAY", "TRIGGER:PT0M", "DESCRIPTION:" + esc(title + " はあと3時間で終わります"), "END:VALARM",
                  "END:VEVENT"]
    L.append("END:VCALENDAR")
    with open(os.path.join(HERE, "calendar.ics"), "w", encoding="utf-8", newline="") as f:
        f.write("\r\n".join(fold(x) for x in L) + "\r\n")
    print("calendar.ics:", sum(1 for x in L if x == "BEGIN:VEVENT"), "events")


if __name__ == "__main__":
    main()
