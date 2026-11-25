#!/usr/bin/env python3
"""Copy public/ to _site/ and write the event lists and Event structured data into the HTML.

The top page fills these lists with JavaScript from events.json / labs.json. Search engines
index the first HTML much more reliably than script output, so the deployed copy carries the
same content as plain HTML (the page script still refreshes it in the browser).
"""
import datetime as dt
import html
import json
import pathlib
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC, OUT = ROOT / "public", ROOT / "_site"
SITE = "https://monday-night-hackathon.pages.dev/"
JST = dt.timezone(dt.timedelta(hours=9))
DOWJ = "月火水木金土日"


def theme(e):
    t = e.get("theme")
    return "近日発表" if not t or t == "未定" else t


def li(e):
    s = dt.datetime.fromisoformat(e["starts_at"]).astimezone(JST)
    end = dt.datetime.fromisoformat(e["ends_at"]).astimezone(JST).strftime("%H:%M") if e.get("ends_at") else ""
    label = html.escape(theme(e))
    if e.get("url"):
        label = f'<a href="{html.escape(e["url"])}">{label}</a>'
    rnd = f'#{e["round"]}　' if e.get("round") else ""
    return f"{s.month}月{s.day}日（{DOWJ[s.weekday()]}）{s:%H:%M}〜{end}　{rnd}お題：{label}"


def replace_once(text, old, new):
    if text.count(old) != 1:
        sys.exit(f"prerender: expected exactly one {old!r} in index.html")
    return text.replace(old, new)


def main():
    now = dt.datetime.now(JST)
    shutil.rmtree(OUT, ignore_errors=True)
    shutil.copytree(SRC, OUT)

    data = json.loads((SRC / "events.json").read_text())
    events = data.get("events", [])
    labs = json.loads((SRC / "labs.json").read_text()).get("labs", [])
    end_of = lambda e: dt.datetime.fromisoformat(e.get("ends_at") or e["starts_at"])
    upcoming = [e for e in events if end_of(e) > now]
    past = [e for e in events if end_of(e) <= now][::-1]

    page = OUT / "index.html"
    s = page.read_text()
    nxt = li(upcoming[0]) if upcoming else "日程は決まり次第お知らせします。"
    s = replace_once(s, '<p id="m-next">日程はLumaとDiscordでお知らせしています。</p>', f'<p id="m-next">{nxt}</p>')
    cal = "".join(f"<li>{li(e)}</li>" for e in upcoming) or "<li>開催日は決まり次第お知らせします。</li>"
    s = replace_once(s, '<ul id="m-cal"></ul>', f'<ul id="m-cal">{cal}</ul>')
    s = replace_once(s, '<ul id="m-past"></ul>', '<ul id="m-past">' + "".join(f"<li>{li(e)}</li>" for e in past) + "</ul>")
    s = replace_once(s, '<ul id="m-labs"></ul>', '<ul id="m-labs">' + "".join(
        f'<li><a href="{html.escape(l["href"])}">{html.escape(l["title"])}</a>：{html.escape(l.get("description", ""))}</li>' for l in labs) + "</ul>")

    ld = [{
        "@type": "Event",
        "name": f'マンデーナイトハッカソン{" #" + str(e["round"]) if e.get("round") else ""}「{theme(e)}」',
        "description": f"毎週月曜夜のオンラインハッカソン。お題「{theme(e)}」で2時間ものづくりして、1人3分で発表します。",
        "startDate": e["starts_at"], **({"endDate": e["ends_at"]} if e.get("ends_at") else {}),
        "eventStatus": "https://schema.org/EventScheduled",
        "eventAttendanceMode": "https://schema.org/OnlineEventAttendanceMode",
        "location": {"@type": "VirtualLocation", "url": data.get("discord_invite") or SITE},
        "image": [SITE + "og.jpg"], "url": e.get("url") or SITE, "inLanguage": "ja",
        "organizer": {"@type": "Organization", "name": "マンデーナイトハッカソン", "url": SITE},
        "superEvent": {"@id": SITE + "#series"},
    } for e in upcoming[:6]]
    if ld:
        block = json.dumps({"@context": "https://schema.org", "@graph": ld}, ensure_ascii=False).replace("</", "<\\/")
        s = replace_once(s, "</head>", f'<script type="application/ld+json" id="ld-events">{block}</script>\n</head>')
    page.write_text(s)

    sm = OUT / "sitemap.xml"
    sm.write_text(sm.read_text().replace("<lastmod>2026-11-11</lastmod>", f"<lastmod>{now:%Y-%m-%d}</lastmod>", 1))
    print(f"prerender: {len(upcoming)} upcoming, {len(past)} past, {len(labs)} labs -> {OUT.relative_to(ROOT)}/")


if __name__ == "__main__":
    main()
