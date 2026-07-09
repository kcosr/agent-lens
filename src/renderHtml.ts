import type { AgentLensReport } from "./types.js";

export function renderHtmlReport(report: AgentLensReport): string {
  const payload = escapeScriptJson(JSON.stringify(report));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agent Lens Report</title>
<style>
:root{
  color-scheme:light;
  --topbar-h:54px;
  --head-h:47px;
  --sidebar-w:308px;
  --bg:#f1f3f6;
  --surface:#ffffff;
  --surface-2:#f7f8fb;
  --surface-3:#eceff3;
  --text:#161a21;
  --muted:#5e6772;
  --faint:#929aa6;
  --border:#e3e7ed;
  --border-strong:#d2d8e1;
  --accent:#2563eb;
  --accent-text:#ffffff;
  --accent-soft:#e7effd;
  --user-bg:#e2e6ec;
  --user-border:#c2cad5;
  --warn:#b45309;
  --warn-bg:#fef6e7;
  --shadow-sm:0 1px 2px rgba(16,24,40,.06);
  --shadow:0 8px 28px -8px rgba(16,24,40,.22);
  --radius:12px;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
}
html[data-theme=dark]{
  color-scheme:dark;
  --bg:#0c0e12;
  --surface:#161a21;
  --surface-2:#11141a;
  --surface-3:#1d222b;
  --text:#e7eaef;
  --muted:#9aa3b0;
  --faint:#69727e;
  --border:#252b34;
  --border-strong:#333b46;
  --accent:#5b8cff;
  --accent-text:#0c0e12;
  --accent-soft:#16233c;
  --user-bg:#232933;
  --user-border:#3a424f;
  --warn:#e7a44a;
  --warn-bg:#241c10;
  --shadow-sm:0 1px 2px rgba(0,0,0,.35);
  --shadow:0 10px 30px -8px rgba(0,0,0,.6);
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--text);font:14px/1.55 var(--sans);-webkit-font-smoothing:antialiased}
button,input,select{font:inherit;color:inherit}
a{color:var(--accent)}
[hidden]{display:none!important}
::selection{background:color-mix(in srgb,var(--accent) 30%,transparent)}

/* ---------- top bar ---------- */
.topbar{position:sticky;top:0;z-index:40;height:var(--topbar-h);display:flex;align-items:center;gap:14px;padding:0 16px;background:color-mix(in srgb,var(--surface) 88%,transparent);backdrop-filter:saturate(160%) blur(8px);border-bottom:1px solid var(--border)}
.brand{display:flex;align-items:center;gap:9px;font-weight:680;font-size:15px;letter-spacing:-.01em;white-space:nowrap}
.brand .logo{color:var(--accent);flex:none}
.range{color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.range b{color:var(--text);font-weight:560}
.spacer{flex:1}
.searchbox{position:relative;display:flex;align-items:center}
.searchbox svg{position:absolute;left:10px;color:var(--faint);pointer-events:none}
.search{width:300px;max-width:42vw;padding:8px 10px 8px 32px;border:1px solid var(--border);border-radius:9px;background:var(--surface-2);outline:none;transition:border-color .15s,box-shadow .15s}
.search:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}
.iconbtn{width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:var(--surface-2);color:var(--muted);cursor:pointer;display:grid;place-items:center;font-size:15px;flex:none}
.iconbtn:hover{color:var(--text);border-color:var(--border-strong)}

/* ---------- layout ---------- */
.body{display:grid;grid-template-columns:var(--sidebar-w) minmax(0,1fr)}
.sidebar{position:sticky;top:var(--topbar-h);align-self:start;height:calc(100vh - var(--topbar-h));overflow:auto;background:var(--surface-2);border-right:1px solid var(--border);padding:6px 12px 40px}
.main{min-width:0}

/* ---------- sidebar sections ---------- */
.sec{border-bottom:1px solid var(--border)}
.sec:last-of-type{border-bottom:0}
.sec>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:7px;font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--faint);font-weight:700;padding:11px 6px;user-select:none}
.sec>summary::-webkit-details-marker{display:none}
.sec>summary::before{content:"";width:6px;height:6px;border-right:1.6px solid currentColor;border-bottom:1.6px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.sec[open]>summary::before{transform:rotate(45deg)}
.sec-count{margin-left:auto;font-weight:600;color:var(--muted);background:var(--surface-3);border-radius:999px;padding:1px 8px;font-size:10px;letter-spacing:0}
.sec-body{padding:0 2px 12px}

/* ---------- conversation list ---------- */
.convo{position:relative;display:flex;gap:9px;align-items:flex-start;width:100%;text-align:left;border:1px solid transparent;background:transparent;border-radius:10px;padding:8px 38px 8px 9px;cursor:pointer;margin-bottom:1px;transition:background .12s,border-color .12s}
.convo:hover{background:var(--surface-3)}
.convo.active{background:var(--surface);border-color:var(--border-strong);box-shadow:var(--shadow-sm)}
.convo.hidden{display:none}
.convo .dot{width:9px;height:9px;border-radius:50%;background:var(--tc,var(--faint));margin-top:4px;flex:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--tc,var(--faint)) 18%,transparent)}
.convo .ctext{min-width:0;flex:1}
.convo .ctitle{font-weight:560;font-size:12.5px;line-height:1.32;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.convo .cmeta{display:flex;align-items:center;gap:6px;margin-top:3px}
.convo.all .dot{background:linear-gradient(135deg,#2f74d0,#0d9488,#16a34a,#d97706,#dc2626);box-shadow:none}
.convo-note{position:absolute;right:7px;bottom:6px;width:25px;height:25px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--muted);display:grid;place-items:center;cursor:pointer;opacity:0;transform:translateY(2px);pointer-events:none;transition:opacity .12s,transform .12s,color .12s,border-color .12s}
.convo:hover .convo-note,.convo:focus-within .convo-note{opacity:1;transform:none;pointer-events:auto}
.convo-note:hover{color:var(--accent);border-color:var(--accent)}
.convo-note svg{width:14px;height:14px}
.badge{display:inline-block;font-size:10px;font-weight:600;color:var(--muted);background:var(--surface-3);border:1px solid var(--border);border-radius:5px;padding:0 6px;line-height:16px;letter-spacing:.02em}
.cmeta .num{font-size:11px;color:var(--faint)}

/* ---------- filters ---------- */
.field{margin:4px 0 12px}
.field-label{font-size:10px;letter-spacing:.07em;text-transform:uppercase;color:var(--faint);font-weight:700;margin:0 0 6px 2px}
.check-row{display:flex;gap:8px;flex-wrap:wrap}
label.check{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;cursor:pointer;padding:5px 9px;border:1px solid var(--border);border-radius:8px;background:var(--surface);user-select:none}
label.check input{accent-color:var(--accent);margin:0}
.select{width:100%;padding:8px 9px;border:1px solid var(--border);border-radius:9px;background:var(--surface);outline:none}
.select:focus{border-color:var(--accent)}

/* ---------- overview stats ---------- */
.statgrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}
.statcell{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:9px 10px}
.statcell b{display:block;font-size:17px;font-weight:680;letter-spacing:-.01em}
.statcell span{font-size:10.5px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
.statcell.flag b{font-size:12px;color:var(--accent);text-transform:uppercase;letter-spacing:.03em;padding-top:4px}

/* ---------- summaries / notices / artifacts ---------- */
.summary{border:1px solid var(--border);border-left:3px solid var(--accent);background:var(--surface);border-radius:10px;padding:9px 11px;margin-bottom:8px}
.summary h4{margin:0 0 5px;font-size:12.5px;font-weight:620}
.summary .sub{font-size:10.5px;color:var(--faint);text-transform:uppercase;letter-spacing:.04em;margin-bottom:6px}
.summary .content{font-size:12px;color:var(--muted);line-height:1.5}
.notice{border-left:3px solid var(--warn);background:var(--warn-bg);color:var(--text);padding:8px 10px;border-radius:8px;margin-bottom:7px;font-size:12px}
.artifact{font-family:var(--mono);font-size:11px;color:var(--muted);padding:3px 4px;overflow-wrap:anywhere}
.muted{color:var(--muted);font-size:12px;padding:4px}

/* ---------- timeline header ---------- */
.timeline-head{position:sticky;top:var(--topbar-h);z-index:25;display:flex;align-items:center;gap:11px;height:var(--head-h);padding:0 24px;background:color-mix(in srgb,var(--bg) 86%,transparent);backdrop-filter:saturate(160%) blur(8px);border-bottom:1px solid var(--border)}
.timeline-head h2{font-size:14px;font-weight:650;margin:0}
.scope{display:inline-flex;align-items:center;gap:7px;font-size:12px;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:3px 11px;max-width:34vw;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.count{font-size:12px;color:var(--faint);white-space:nowrap}
.head-actions{margin-left:auto;display:flex;align-items:center;gap:8px}
.seg{display:inline-flex;background:var(--surface-3);border-radius:9px;padding:3px}
.seg button{border:0;background:transparent;padding:5px 11px;border-radius:7px;font-size:12px;font-weight:540;cursor:pointer;color:var(--muted)}
.seg button.active{background:var(--surface);color:var(--text);box-shadow:var(--shadow-sm)}
.toggle{display:inline-flex;align-items:center;gap:5px;border:1px solid var(--border);background:var(--surface);border-radius:8px;padding:6px 11px;font-size:12px;color:var(--muted);cursor:pointer}
.toggle:hover{color:var(--text);border-color:var(--border-strong)}

/* ---------- timeline ---------- */
.timeline{display:flex;flex-direction:column;gap:13px;padding:20px 24px;max-width:1080px;margin:0 auto;width:100%}
.group-divider{display:flex;align-items:center;gap:12px;margin:14px 0 1px}
.group-divider .ln{flex:1;height:1px;background:var(--border)}
.gchip{display:inline-flex;align-items:center;gap:8px;background:var(--surface);border:1px solid var(--border-strong);border-radius:999px;padding:4px 13px;font-size:12px;font-weight:580;box-shadow:var(--shadow-sm)}
.gchip .dot{width:8px;height:8px;border-radius:50%;background:var(--tc,var(--faint))}
.gchip .gmeta{color:var(--muted);font-weight:450;border-left:1px solid var(--border);padding-left:8px}
.current-group{position:sticky;top:calc(var(--topbar-h) + var(--head-h));z-index:18;display:inline-flex;align-items:center;gap:9px;align-self:flex-start;max-width:100%;margin:0 0 3px;padding:5px 13px;background:var(--surface);border:1px solid var(--border-strong);border-radius:999px;box-shadow:var(--shadow);font-size:12px;font-weight:580}
.current-group .dot{width:8px;height:8px;border-radius:50%;background:var(--tc,var(--faint));flex:none}
.current-group .ctitle{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.current-group .gmeta{color:var(--muted);font-weight:450;border-left:1px solid var(--border);padding-left:9px;flex:none}

.item{display:flex}
.item.hidden{display:none}
.item[data-role=user]{justify-content:flex-end}
.bubble{position:relative;max-width:min(820px,100%);background:var(--surface);border:1px solid var(--border);border-left:3px solid var(--tc,var(--faint));border-radius:var(--radius);padding:12px 15px;box-shadow:var(--shadow-sm)}
.item[data-role=user] .bubble{background:var(--user-bg);border-color:var(--user-border);border-left-color:var(--tc,var(--faint))}
.item[data-type=annotation]{justify-content:stretch}
.item[data-type=annotation] .bubble{max-width:100%;width:100%;border-left-color:var(--accent);background:var(--surface)}

.msg-head{display:flex;align-items:center;gap:9px;margin-bottom:8px;flex-wrap:wrap}
.role{display:inline-flex;align-items:center;gap:6px;font-size:10.5px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;padding:2px 8px;border-radius:7px}
.role::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.role-assistant{color:var(--tc,var(--muted));background:color-mix(in srgb,var(--tc,var(--muted)) 15%,transparent)}
.role-user{color:var(--tc,var(--muted));background:color-mix(in srgb,var(--tc,var(--muted)) 15%,transparent)}
.role-note{color:var(--accent);background:var(--accent-soft)}
.thread-chip{display:inline-flex;align-items:center;gap:7px;font-size:11.5px;color:var(--muted);background:var(--surface-3);border:1px solid var(--border);border-radius:999px;padding:2px 10px;max-width:340px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.thread-chip .dot{width:7px;height:7px;border-radius:50%;background:var(--tc,var(--faint));flex:none}
.timeline.focused .thread-chip{display:none}
.time{margin-left:auto;font-size:11px;color:var(--faint);font-variant-numeric:tabular-nums;white-space:nowrap}

.content{font-size:13.5px;line-height:1.62;color:var(--text);overflow-wrap:anywhere;max-height:480px;overflow:hidden;position:relative}
.item.expanded .content{max-height:none}
.item[data-type=annotation] .content,.summary .content{max-height:none}
.item[data-expandable=true]:not(.expanded) .content::after{content:"";position:absolute;left:0;right:0;bottom:0;height:64px;background:linear-gradient(to bottom,transparent,var(--surface));pointer-events:none}
.item[data-role=user][data-expandable=true]:not(.expanded) .content::after{background:linear-gradient(to bottom,transparent,var(--user-bg))}
.content>:first-child{margin-top:0}
.content>:last-child{margin-bottom:0}
.content p{margin:0 0 10px}
.content h1,.content h2,.content h3,.content h4,.content h5,.content h6{margin:14px 0 7px;line-height:1.3;font-weight:660}
.content h1{font-size:17px}.content h2{font-size:15.5px}.content h3{font-size:14px}.content h4,.content h5,.content h6{font-size:13px}
.content ul,.content ol{margin:7px 0 10px;padding-left:21px}
.content li{margin:3px 0}
.content code{font-family:var(--mono);font-size:.86em;background:var(--surface-3);border:1px solid var(--border);border-radius:5px;padding:1px 5px}
.content pre.code{font-family:var(--mono);font-size:12px;line-height:1.5;background:var(--surface-3);border:1px solid var(--border);border-radius:10px;padding:11px 13px;overflow:auto;margin:9px 0}
.content pre.code code{background:none;border:0;padding:0;font-size:inherit}
.content blockquote{margin:9px 0;padding:3px 13px;border-left:3px solid var(--border-strong);color:var(--muted)}
.content a{color:var(--accent);text-decoration:underline;text-underline-offset:2px;overflow-wrap:anywhere}
.actions{margin-top:11px}

.empty{margin:48px auto;max-width:460px;text-align:center;color:var(--muted);border:1px dashed var(--border-strong);border-radius:14px;padding:34px 24px}

/* ---------- activity view ---------- */
.activity{padding:16px 24px 64px;max-width:1180px;margin:0 auto;width:100%}
.act-summary{font-size:12px;color:var(--muted);margin:2px 2px 14px;line-height:1.5}
.act-summary b{color:var(--text);font-weight:620}
.act-axis{display:grid;grid-template-columns:34px 1fr;margin-bottom:5px}
.act-axis-track{position:relative;height:16px}
.act-tick{position:absolute;top:0;transform:translateX(-50%);color:var(--faint)}
.act-tick b{font-size:10px;font-weight:600;white-space:nowrap}
.act-lanes{position:relative;border:1px solid var(--border);border-radius:12px;background:var(--surface);padding:5px 0;overflow:hidden}
.act-grid{position:absolute;left:34px;right:0;top:0;bottom:0;pointer-events:none}
.act-gline{position:absolute;top:0;bottom:0;width:1px;background:var(--border);opacity:.5}
.act-gline.major{opacity:.85}
.act-lane{position:relative;display:grid;grid-template-columns:34px 1fr;align-items:center;height:34px;transition:opacity .15s}
.act-lane.dim{opacity:.2}
.act-lane:hover{background:color-mix(in srgb,var(--tc) 8%,transparent)}
.act-gutter{display:grid;place-items:center;height:100%}
.act-gutter .dot{width:10px;height:10px;border-radius:50%;background:var(--tc);box-shadow:0 0 0 3px color-mix(in srgb,var(--tc) 20%,transparent)}
.act-track{position:relative;height:100%}
.act-baseline{position:absolute;left:0;right:10px;top:50%;height:1px;background:var(--border);opacity:.6}
.act-bubble{position:absolute;top:50%;transform:translate(-50%,-50%);border-radius:50%;background:color-mix(in srgb,var(--tc) 58%,transparent);border:1.5px solid var(--tc);cursor:pointer;padding:0;transition:transform .1s ease,background .1s}
.act-bubble:hover{background:var(--tc);transform:translate(-50%,-50%) scale(1.2);z-index:4}
.act-bubble:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
.act-empty{padding:48px 24px;text-align:center;color:var(--muted);border:1px dashed var(--border-strong);border-radius:12px;margin-top:8px}
.act-tip{position:fixed;left:0;top:0;z-index:70;max-width:300px;background:var(--surface);border:1px solid var(--border-strong);border-radius:10px;box-shadow:var(--shadow);padding:9px 11px;font-size:12px;pointer-events:none;opacity:0;transition:opacity .1s}
.act-tip.show{opacity:1}
.act-tip .tt{display:flex;align-items:center;gap:7px;font-weight:620;margin-bottom:3px}
.act-tip .tt .dot{width:8px;height:8px;border-radius:50%;background:var(--tc,var(--faint));flex:none}
.act-tip .tm{color:var(--muted);font-size:11px;margin-bottom:5px}
.act-tip .tp{color:var(--text);line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
@keyframes lensflash{0%{box-shadow:0 0 0 3px var(--accent)}100%{box-shadow:0 0 0 0 transparent}}
.item.flash .bubble{animation:lensflash 1.7s ease-out}

.to-top{position:fixed;right:22px;bottom:22px;z-index:45;width:42px;height:42px;border-radius:50%;border:1px solid var(--border-strong);background:var(--surface);color:var(--text);box-shadow:var(--shadow);cursor:pointer;display:grid;place-items:center;font-size:18px;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .2s,transform .2s}
.to-top.show{opacity:1;transform:none;pointer-events:auto}

body.modal-open{overflow:hidden}
.modal-backdrop{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:24px;background:rgba(12,14,18,.48);backdrop-filter:blur(3px)}
.modal{width:min(780px,100%);max-height:min(760px,86vh);display:flex;flex-direction:column;background:var(--surface);border:1px solid var(--border-strong);border-radius:14px;box-shadow:var(--shadow);overflow:hidden}
.modal-head{display:flex;align-items:flex-start;gap:14px;padding:16px 18px;border-bottom:1px solid var(--border);background:var(--surface-2)}
.modal-title-wrap{min-width:0;flex:1}
.modal-title{font-size:16px;font-weight:680;line-height:1.35;margin:0;overflow-wrap:anywhere}
.modal-meta{font-size:12px;color:var(--muted);margin-top:3px}
.modal-close{width:32px;height:32px;border:1px solid var(--border);border-radius:9px;background:var(--surface);color:var(--muted);cursor:pointer;display:grid;place-items:center;flex:none}
.modal-close:hover{color:var(--text);border-color:var(--border-strong)}
.modal-body{padding:16px 18px;overflow:auto}
.modal-body .summary{margin-bottom:12px}
.modal-body .summary:last-child{margin-bottom:0}

@media (max-width:920px){
  .body{grid-template-columns:1fr}
  .sidebar{position:static;height:auto;border-right:0;border-bottom:1px solid var(--border)}
  .range{display:none}
  .search{width:200px}
  .timeline,.timeline-head,.activity{padding-left:14px;padding-right:14px}
  .bubble{max-width:100%}
  .head-actions .toggle{display:none}
}
</style>
</head>
<body>
<script id="agent-lens-data" type="application/json">${payload}</script>
<header class="topbar">
  <div class="brand">
    <svg class="logo" width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="2"></circle>
      <circle cx="12" cy="12" r="3.3" fill="currentColor"></circle>
      <path d="M12 3v4.4M21 12h-4.4M12 21v-4.4M3 12h4.4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"></path>
    </svg>
    Agent Lens
  </div>
  <div class="range" id="report-range"></div>
  <div class="spacer"></div>
  <div class="searchbox">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2"></circle><path d="m20 20-3.5-3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"></path></svg>
    <input class="search" id="search" placeholder="Search messages…" autocomplete="off">
  </div>
  <button class="iconbtn" id="theme-toggle" title="Toggle light / dark" aria-label="Toggle theme"><span id="theme-icon">☾</span></button>
</header>
<div class="body">
  <aside class="sidebar">
    <details class="sec" open>
      <summary>Conversations <span class="sec-count" id="convo-count"></span></summary>
      <div class="sec-body">
        <button class="convo all active" data-thread="" type="button"><span class="dot"></span><span class="ctext"><span class="ctitle">All conversations</span><span class="cmeta"><span class="num" id="convo-all-num"></span></span></span></button>
        <div id="threads"></div>
      </div>
    </details>
    <details class="sec" open>
      <summary>Filters</summary>
      <div class="sec-body">
        <div class="field">
          <div class="field-label">Conversation Roles</div>
          <div class="check-row">
            <label class="check"><input type="checkbox" id="role-user" checked> User</label>
            <label class="check"><input type="checkbox" id="role-assistant" checked> Assistant</label>
          </div>
        </div>
        <div class="field">
          <div class="field-label">Source</div>
          <select class="select" id="instance-filter"><option value="">All sources</option></select>
        </div>
        <div class="field">
          <div class="field-label">Conversation order</div>
          <select class="select" id="conversation-order">
            <option value="chronological">Chronological</option>
            <option value="recent">Latest activity</option>
          </select>
        </div>
        <div class="field" style="margin-bottom:2px">
          <label class="check"><input type="checkbox" id="show-annotations" checked> Show annotations</label>
        </div>
      </div>
    </details>
    <details class="sec" open>
      <summary>Overview</summary>
      <div class="sec-body"><div class="statgrid" id="stats"></div></div>
    </details>
    <details class="sec" id="notices-section" open hidden>
      <summary>Notices</summary>
      <div class="sec-body" id="notices"></div>
    </details>
    <details class="sec" id="artifacts-section" hidden>
      <summary>Artifacts &amp; Paths</summary>
      <div class="sec-body" id="artifacts"></div>
    </details>
  </aside>
  <main class="main">
    <div class="timeline-head">
      <h2>Timeline</h2>
      <span class="scope" id="scope">All conversations</span>
      <span class="count" id="count"></span>
      <div class="head-actions">
        <div class="seg" id="view-toggle">
          <button type="button" data-view="chrono" class="active">Chronological</button>
          <button type="button" data-view="grouped">By conversation</button>
          <button type="button" data-view="activity">Activity</button>
        </div>
        <button class="toggle" id="expand-all" type="button">Expand all</button>
        <button class="toggle" id="collapse-all" type="button">Collapse all</button>
      </div>
    </div>
    <section class="timeline" id="timeline"></section>
    <div class="activity" id="activity" hidden></div>
    <div class="empty" id="empty" hidden>No messages match the current filters.</div>
  </main>
</div>
<div class="modal-backdrop" id="summary-modal" role="dialog" aria-modal="true" aria-labelledby="summary-modal-title" hidden>
  <section class="modal">
    <div class="modal-head">
      <div class="modal-title-wrap">
        <h2 class="modal-title" id="summary-modal-title">Summary</h2>
        <div class="modal-meta" id="summary-modal-meta"></div>
      </div>
      <button class="modal-close" id="summary-modal-close" type="button" aria-label="Close summary">×</button>
    </div>
    <div class="modal-body" id="summary-modal-body"></div>
  </section>
</div>
<div class="act-tip" id="act-tip"></div>
<button class="to-top" id="to-top" type="button" aria-label="Scroll to top">↑</button>
<script>
const report = JSON.parse(document.getElementById('agent-lens-data').textContent);
const state = { q:'', annotations:true, userRole:true, assistantRole:true, instance:'', thread:'', view:'chrono', conversationOrder:'chronological' };
const collapsedContentHeight = 480;
const byId = id => document.getElementById(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
const fmt = value => value ? new Date(value).toLocaleTimeString([], {hour:'numeric',minute:'2-digit'}) : '';
const fmtFull = value => value ? new Date(value).toLocaleString([], {month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}) : '';

function md(text){
  if (!text) return '';
  let src = String(text).replace(/\\r\\n/g,'\\n');
  const blocks = [];
  src = src.replace(/\\u0060\\u0060\\u0060([\\w-]*)\\n?([\\s\\S]*?)\\u0060\\u0060\\u0060/g, (m, lang, code) => {
    blocks.push('<pre class="code"><code>' + esc(code.replace(/\\n$/,'')) + '</code></pre>');
    return '\\u0000B' + (blocks.length - 1) + '\\u0000';
  });
  src = esc(src);
  src = src.replace(/^\\s{0,3}######\\s+(.*)$/gm,'<h6>$1</h6>')
           .replace(/^\\s{0,3}#####\\s+(.*)$/gm,'<h5>$1</h5>')
           .replace(/^\\s{0,3}####\\s+(.*)$/gm,'<h4>$1</h4>')
           .replace(/^\\s{0,3}###\\s+(.*)$/gm,'<h3>$1</h3>')
           .replace(/^\\s{0,3}##\\s+(.*)$/gm,'<h2>$1</h2>')
           .replace(/^\\s{0,3}#\\s+(.*)$/gm,'<h1>$1</h1>');
  const lines = src.split('\\n');
  const out = [];
  let listType = null;
  let para = [];
  const flushPara = () => { if (para.length){ out.push('<p>' + para.join('<br>') + '</p>'); para = []; } };
  const closeList = () => { if (listType){ out.push('</' + listType + '>'); listType = null; } };
  for (const line of lines){
    const ul = line.match(/^\\s*[-*+]\\s+(.*)$/);
    const ol = line.match(/^\\s*\\d+[.)]\\s+(.*)$/);
    const quote = line.match(/^\\s*&gt;\\s?(.*)$/);
    if (ul){ flushPara(); if (listType!=='ul'){ closeList(); out.push('<ul>'); listType='ul'; } out.push('<li>' + ul[1] + '</li>'); continue; }
    if (ol){ flushPara(); if (listType!=='ol'){ closeList(); out.push('<ol>'); listType='ol'; } out.push('<li>' + ol[1] + '</li>'); continue; }
    closeList();
    if (/^\\u0000B\\d+\\u0000$/.test(line.trim())){ flushPara(); out.push(line.trim()); continue; }
    if (quote){ flushPara(); out.push('<blockquote>' + quote[1] + '</blockquote>'); continue; }
    if (/^\\s*$/.test(line)){ flushPara(); continue; }
    if (/^\\s*<(h[1-6]|pre|blockquote)/.test(line)){ flushPara(); out.push(line.trim()); continue; }
    para.push(line);
  }
  flushPara(); closeList();
  let html = out.join('\\n');
  html = html.replace(/\\u0060([^\\u0060]+)\\u0060/g,'<code>$1</code>');
  html = html.replace(/\\*\\*([^*]+)\\*\\*/g,'<strong>$1</strong>');
  html = html.replace(/\\[([^\\]]+)\\]\\(([^)\\s]+)\\)/g,'<a href="$2" target="_blank" rel="noreferrer noopener">$1</a>');
  html = html.replace(/\\u0000B(\\d+)\\u0000/g, (m,i)=>blocks[+i]);
  return html;
}

function itemText(item){ return [item.title,item.text,item.markdown,item.source,item.server,item.threadId,item.sessionId,item.kind,item.role].filter(Boolean).join('\\n').toLowerCase(); }
function conversationKey(source, server, id){ return source === 'codex-threads' ? 'codex:' + String(server || '') + ':' + String(id || '') : String(source || 'unknown') + ':' + String(id || ''); }
function eventKey(event){ return conversationKey(event.source, event.server, event.threadId || event.sessionId || event.id); }
function threadKey(thread){ return conversationKey(thread.source, thread.server, thread.threadId || thread.sessionId || thread.id); }
function sourceFamily(source){
  if (source === 'assistant') return 'assistant';
  if (source === 'claude') return 'claude';
  if (source === 'codex') return 'codex';
  if (source === 'codex-threads') return 'codex';
  return source || 'unknown';
}
function instanceKeyFor(source, server){
  const family = sourceFamily(source);
  if (family === 'codex') return server ? 'codex:' + server : 'codex';
  return family;
}
function instanceLabel(instance){
  if (instance === 'assistant') return 'Assistant';
  if (instance === 'claude') return 'Claude';
  if (instance === 'codex') return 'Codex';
  if (instance && instance.startsWith('codex:')) return 'Codex (' + instance.slice(6) + ')';
  return instance ? String(instance) : 'Unknown';
}
function instanceSort(a, b){
  const order = ['assistant','claude'];
  const ai = order.indexOf(a);
  const bi = order.indexOf(b);
  if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  if (a === 'codex' && b.startsWith('codex:')) return -1;
  if (a.startsWith('codex:') && b === 'codex') return 1;
  if (a.startsWith('codex:') && b.startsWith('codex:')) return a.localeCompare(b);
  if (a.startsWith('codex:')) return -1;
  if (b.startsWith('codex:')) return 1;
  return String(a).localeCompare(String(b));
}
function itemInstance(item){ return instanceKeyFor(item.source, item.server); }
function threadInstance(thread){ return instanceKeyFor(thread.source, thread.server); }

const threadKeys = Array.from(new Set([
  ...report.threads.map(threadKey),
  ...report.events.map(event => eventKey(event))
].filter(Boolean))).sort((a, b) => String(a).localeCompare(String(b)));
const threadPalette = ['#2f74d0','#0d9488','#16a34a','#d97706','#dc2626','#0891b2','#ca8a04','#ea580c','#5a8f1a','#5b6472','#7c5cd6','#0e7490'];
const threadColorMap = new Map(threadKeys.map((key, index) => [key, threadPalette[index % threadPalette.length]]));
function threadColor(key){ return threadColorMap.get(key || 'unknown') || '#5b6472'; }

const instanceMap = new Map(report.threads.map(t => [threadKey(t), threadInstance(t)]));
function instanceForKey(key){ return instanceMap.get(key) || ''; }
function instanceLabelForKey(key){ return instanceLabel(instanceForKey(key)); }

const threadTitleMap = new Map(report.threads.map(thread => [threadKey(thread), thread.label]));
const threadSummariesMap = new Map();
for (const annotation of report.annotations) {
  const metadata = annotation.metadata || {};
  const id = metadata.threadId || metadata.sessionId;
  const key = id && metadata.source ? conversationKey(metadata.source, metadata.server, id) : '';
  if (annotation.placement === 'sidebar' && key) {
    const summaries = threadSummariesMap.get(key) || [];
    summaries.push(annotation);
    threadSummariesMap.set(key, summaries);
  }
  if (!annotation.title) continue;
  if (key) threadTitleMap.set(key, annotation.title);
}
function threadTitle(key){ return threadTitleMap.get(key) || key || 'Conversation'; }

const eventCountByThread = new Map();
const firstActivityByThread = new Map();
const lastActivityByThread = new Map();
for (const event of report.events){
  const key = eventKey(event);
  eventCountByThread.set(key, (eventCountByThread.get(key) || 0) + 1);
  if (!firstActivityByThread.has(key) || event.timestamp < firstActivityByThread.get(key)) firstActivityByThread.set(key, event.timestamp);
  if (!lastActivityByThread.has(key) || event.timestamp > lastActivityByThread.get(key)) lastActivityByThread.set(key, event.timestamp);
}
function conversationActivity(thread, edge){
  const key = threadKey(thread);
  if (edge === 'first') return firstActivityByThread.get(key) || thread.createdAt || thread.updatedAt || '';
  return lastActivityByThread.get(key) || thread.updatedAt || thread.createdAt || '';
}

function annotationTime(annotation){
  if (annotation.timestamp) return annotation.timestamp;
  if (annotation.anchorEventId){
    const event = report.events.find(e => e.id === annotation.anchorEventId);
    if (event) return event.timestamp;
  }
  if (annotation.range && annotation.range.start) return annotation.range.start;
  return report.metadata.generatedAt;
}
function annotationThreadKey(annotation){
  const metadata = annotation.metadata || {};
  const id = metadata.threadId || metadata.sessionId;
  return id && metadata.source ? conversationKey(metadata.source, metadata.server, id) : '';
}
function annotationInstance(annotation){
  const key = annotationThreadKey(annotation);
  return key ? instanceForKey(key) : '';
}
function buildItems(){
  const events = report.events.map(e => ({...e, itemType:'event', sortTime:e.timestamp}));
  const annotations = report.annotations.filter(a => a.placement !== 'sidebar').map(a => ({...a, itemType:'annotation', sortTime:annotationTime(a)}));
  return [...events, ...annotations].sort((a,b) => Date.parse(a.sortTime)-Date.parse(b.sortTime) || String(a.id).localeCompare(String(b.id)));
}

const ITEMS = buildItems();
const TOTAL = ITEMS.length;
const elementId = item => (item.itemType === 'annotation' ? 'annotation-' : 'event-') + item.id;
const orderChrono = ITEMS.map(elementId);
const firstIndex = new Map();
ITEMS.forEach((item, i) => { const k = item.itemType === 'event' ? eventKey(item) : '~'; if (!firstIndex.has(k)) firstIndex.set(k, i); });
const orderGrouped = ITEMS.map((item, i) => ({item, i})).sort((a, b) => {
  const ka = a.item.itemType === 'event' ? eventKey(a.item) : '~';
  const kb = b.item.itemType === 'event' ? eventKey(b.item) : '~';
  return (firstIndex.get(ka) - firstIndex.get(kb)) || (a.i - b.i);
}).map(x => elementId(x.item));

function itemHtml(item){
  const id = elementId(item);
  if (item.itemType === 'annotation'){
    const key = annotationThreadKey(item);
    return '<article id="' + esc(id) + '" class="item annotation" data-type="annotation" data-instance="' + esc(annotationInstance(item)) + '" data-thread="' + esc(key) + '" data-search="' + esc(itemText(item)) + '" data-time="' + esc(item.sortTime) + '"><div class="bubble"><div class="msg-head message-title"><span class="role role-note">' + esc(item.title || item.kind) + '</span><span class="time">' + esc(fmt(item.sortTime)) + '</span></div><div class="content">' + md(item.markdown) + '</div></div></article>';
  }
  const key = eventKey(item);
  const roleLabel = item.role === 'user' ? 'User' : 'Agent';
  return '<article id="' + esc(id) + '" class="item" style="--tc:' + threadColor(key) + '" data-type="event" data-instance="' + esc(itemInstance(item)) + '" data-thread="' + esc(key) + '" data-role="' + esc(item.role) + '" data-search="' + esc(itemText(item)) + '" data-time="' + esc(item.timestamp) + '"><div class="bubble"><div class="msg-head message-title"><span class="role role-' + esc(item.role) + '">' + roleLabel + '</span><span class="thread-chip"><span class="dot"></span>' + esc(threadTitle(key)) + '</span><span class="time">' + esc(fmt(item.timestamp)) + '</span></div><div class="content">' + md(item.text || '') + '</div><div class="actions"><button class="toggle" type="button" data-toggle>Expand</button></div></div></article>';
}

function renderSidebar(){
  const range = report.metadata.range || {};
  byId('report-range').innerHTML = '<b>' + esc(range.since ? fmtFull(range.since) : 'beginning') + '</b> → <b>' + esc(range.until ? fmtFull(range.until) : 'now') + '</b>';
  byId('convo-count').textContent = String(report.threads.length);
  byId('convo-all-num').textContent = report.events.length + ' messages';
  byId('stats').innerHTML = [
    ['events', report.events.length],
    ['user', report.events.filter(e => e.role === 'user').length],
    ['assistant', report.events.filter(e => e.role === 'assistant').length],
    ['threads', report.threads.length],
    ['annotations', report.annotations.length]
  ].map(([label, value]) => '<div class="statcell"><b>' + esc(String(value)) + '</b><span>' + esc(label) + '</span></div>').join('')
    + '<div class="statcell flag"><b>' + (report.metadata.redactionEnabled ? 'redacted' : 'raw') + '</b><span>data</span></div>';
  const instances = [...new Set(report.threads.map(t => threadInstance(t)).filter(Boolean))].sort(instanceSort);
  byId('instance-filter').innerHTML += instances.map(s => '<option value="' + esc(s) + '">' + esc(instanceLabel(s)) + '</option>').join('');
  renderConversationList();
  const notices = report.notices || [];
  byId('notices-section').hidden = notices.length === 0;
  byId('notices').innerHTML = notices.map(n => '<div class="notice">' + esc(n.message) + '</div>').join('');
  byId('artifacts-section').hidden = !report.artifacts.length;
  byId('artifacts').innerHTML = report.artifacts.slice(0, 60).map(a => '<div class="artifact">' + esc(a) + '</div>').join('');
}
function renderConversationList(){
  const threads = [...report.threads].sort((left, right) => {
    const leftTime = conversationActivity(left, state.conversationOrder === 'recent' ? 'last' : 'first');
    const rightTime = conversationActivity(right, state.conversationOrder === 'recent' ? 'last' : 'first');
    const delta = leftTime.localeCompare(rightTime);
    return state.conversationOrder === 'recent' ? -delta || threadKey(left).localeCompare(threadKey(right)) : delta || threadKey(left).localeCompare(threadKey(right));
  });
  byId('threads').innerHTML = threads.map(t => {
    const key = threadKey(t);
    const instance = threadInstance(t);
    const count = eventCountByThread.get(key) || 0;
    const note = threadSummariesMap.has(key) ? '<button class="convo-note" type="button" data-summary-thread="' + esc(key) + '" title="Open summary" aria-label="Open summary"><svg viewBox="0 0 24 24" aria-hidden="true" fill="none"><path d="M7 4.5h10A2.5 2.5 0 0 1 19.5 7v10a2.5 2.5 0 0 1-2.5 2.5H7A2.5 2.5 0 0 1 4.5 17V7A2.5 2.5 0 0 1 7 4.5Z" stroke="currentColor" stroke-width="1.8"></path><path d="M8 9h8M8 12h8M8 15h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg></button>' : '';
    return '<div class="convo" role="button" tabindex="0" data-instance="' + esc(instance) + '" data-thread="' + esc(key) + '" style="--tc:' + threadColor(key) + '"><span class="dot"></span><span class="ctext"><span class="ctitle">' + esc(threadTitle(key)) + '</span><span class="cmeta"><span class="badge">' + esc(instanceLabel(instance)) + '</span><span class="num">' + count + '</span></span></span>' + note + '</div>';
  }).join('') || '<div class="muted">No threads discovered.</div>';
}

function openSummaryModal(key){
  const summaries = threadSummariesMap.get(key) || [];
  if (!summaries.length) return;
  byId('summary-modal-title').textContent = threadTitle(key);
  byId('summary-modal-meta').textContent = summaries.length === 1 ? 'Thread summary' : summaries.length + ' thread summaries';
  byId('summary-modal-body').innerHTML = summaries.map(a => '<article class="summary"><h4>' + esc(a.title || a.kind) + '</h4><div class="sub">' + esc(a.kind) + (a.author ? ' · ' + esc(a.author) : '') + '</div><div class="content">' + md(a.markdown) + '</div></article>').join('');
  byId('summary-modal').hidden = false;
  document.body.classList.add('modal-open');
  byId('summary-modal-close').focus();
}
function closeSummaryModal(){
  byId('summary-modal').hidden = true;
  document.body.classList.remove('modal-open');
}

function renderTimeline(){
  byId('timeline').innerHTML = '<div class="current-group" id="current-group" hidden></div>' + ITEMS.map(itemHtml).join('');
  byId('timeline').querySelectorAll('[data-toggle]').forEach(btn => btn.addEventListener('click', () => toggleItem(btn.closest('.item'))));
  refreshOverflowToggles();
}

function makeDivider(key){
  const div = document.createElement('div');
  div.className = 'group-divider';
  div.dataset.thread = key;
  div.style.setProperty('--tc', threadColor(key));
  const inst = instanceForKey(key);
  div.innerHTML = '<span class="ln"></span><span class="gchip"><span class="dot"></span>' + esc(threadTitle(key)) + (inst ? '<span class="gmeta">' + esc(instanceLabel(inst)) + '</span>' : '') + '</span><span class="ln"></span>';
  return div;
}
function refreshGroupDividers(){
  const timeline = byId('timeline');
  timeline.querySelectorAll('.group-divider').forEach(d => d.remove());
  let last = null;
  timeline.querySelectorAll('.item').forEach(item => {
    if (item.classList.contains('hidden')) return;
    if (item.dataset.type === 'annotation') return;
    const key = item.dataset.thread;
    if (key !== last){
      item.parentNode.insertBefore(makeDivider(key), item);
      last = key;
    }
  });
}
const headOffset = (() => {
  const style = getComputedStyle(document.documentElement);
  return (parseInt(style.getPropertyValue('--topbar-h')) || 54) + (parseInt(style.getPropertyValue('--head-h')) || 47);
})();
let cgPending = false;
function updateCurrentGroup(){
  cgPending = false;
  const cg = byId('current-group');
  if (!cg) return;
  const line = headOffset + 10;
  let key = null;
  const dividers = byId('timeline').querySelectorAll('.group-divider');
  for (const divider of dividers){
    if (divider.getBoundingClientRect().top <= line) key = divider.dataset.thread; else break;
  }
  if (key === null){ cg.hidden = true; cg.dataset.thread = '\\u0001'; return; }
  cg.hidden = false;
  if (cg.dataset.thread !== key){
    cg.dataset.thread = key;
    cg.style.setProperty('--tc', threadColor(key));
    const inst = instanceForKey(key);
    cg.innerHTML = '<span class="dot"></span><span class="ctitle">' + esc(threadTitle(key)) + '</span>' + (inst ? '<span class="gmeta">' + esc(instanceLabel(inst)) + '</span>' : '');
  }
}
function scheduleCurrentGroup(){ if (!cgPending){ cgPending = true; requestAnimationFrame(updateCurrentGroup); } }
function refreshOverflowToggles(){
  byId('timeline').querySelectorAll('.item[data-type="event"]').forEach(item => {
    const content = item.querySelector('.content');
    const actions = item.querySelector('.actions');
    const btn = item.querySelector('[data-toggle]');
    if (!content || !actions || !btn) return;
    const expandable = content.scrollHeight > collapsedContentHeight + 1;
    item.dataset.expandable = expandable ? 'true' : 'false';
    actions.hidden = !expandable;
    if (!expandable) item.classList.remove('expanded');
    btn.textContent = item.classList.contains('expanded') ? 'Collapse' : 'Expand';
  });
}
function toggleItem(item){
  if (!item || item.dataset.expandable !== 'true') return;
  item.classList.toggle('expanded');
  const btn = item.querySelector('[data-toggle]');
  if (btn) btn.textContent = item.classList.contains('expanded') ? 'Collapse' : 'Expand';
}
function setAllExpanded(expanded){
  byId('timeline').querySelectorAll('.item[data-type="event"][data-expandable="true"]').forEach(item => {
    item.classList.toggle('expanded', expanded);
    const btn = item.querySelector('[data-toggle]');
    if (btn) btn.textContent = expanded ? 'Collapse' : 'Expand';
  });
}

function threadMatchesInstance(key){
  return !state.instance || instanceForKey(key) === state.instance;
}
function refreshConversationList(){
  let shown = 0;
  let messages = 0;
  document.querySelectorAll('.convo:not(.all)').forEach(convo => {
    const key = convo.dataset.thread || '';
    const show = threadMatchesInstance(key);
    convo.classList.toggle('hidden', !show);
    if (show) {
      shown += 1;
      messages += eventCountByThread.get(key) || 0;
    }
  });
  byId('convo-count').textContent = String(shown);
  byId('convo-all-num').textContent = messages + ' messages';
}
function clearThreadIfFilteredOut(){
  if (state.thread && !threadMatchesInstance(state.thread)) state.thread = '';
}
const CLUSTER_GAP_MS = 8 * 60 * 1000;
const ACT_INSET = 1.8;
const userEventsByThread = new Map();
for (const event of report.events){
  if (event.role !== 'user') continue;
  const key = eventKey(event);
  if (!userEventsByThread.has(key)) userEventsByThread.set(key, []);
  userEventsByThread.get(key).push(event);
}
for (const list of userEventsByThread.values()) list.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
const activityDomain = (() => {
  const range = report.metadata.range || {};
  const times = [];
  for (const list of userEventsByThread.values()) for (const e of list) times.push(Date.parse(e.timestamp));
  let start = range.since ? Date.parse(range.since) : (times.length ? Math.min.apply(null, times) : 0);
  let end = range.until ? Date.parse(range.until) : (times.length ? Math.max.apply(null, times) : start + 3600000);
  if (times.length){ start = Math.min(start, Math.min.apply(null, times)); end = Math.max(end, Math.max.apply(null, times)); }
  if (!(end > start)) end = start + 3600000;
  return { start, end };
})();
function activityX(ms){
  const span = activityDomain.end - activityDomain.start;
  const p = span > 0 ? (ms - activityDomain.start) / span : 0;
  return Math.max(0, Math.min(100, ACT_INSET + p * (100 - 2 * ACT_INSET)));
}
function clusterUserEvents(events){
  const clusters = [];
  let current = null;
  for (const event of events){
    const t = Date.parse(event.timestamp);
    if (current && t - current.lastT <= CLUSTER_GAP_MS){ current.events.push(event); current.lastT = t; }
    else { current = { events: [event], firstT: t, lastT: t }; clusters.push(current); }
  }
  return clusters;
}
function renderActivity(){
  const activity = byId('activity');
  const domain = activityDomain;
  let gridlines = '';
  let ticks = '';
  let tick = new Date(domain.start); tick.setMinutes(0, 0, 0);
  if (tick.getTime() < domain.start) tick = new Date(tick.getTime() + 3600000);
  for (; tick.getTime() <= domain.end; tick = new Date(tick.getTime() + 3600000)){
    const x = activityX(tick.getTime()).toFixed(2);
    const major = tick.getHours() % 2 === 0;
    gridlines += '<span class="act-gline' + (major ? ' major' : '') + '" style="left:' + x + '%"></span>';
    ticks += '<span class="act-tick" style="left:' + x + '%">' + (major ? '<b>' + esc(tick.toLocaleTimeString([], {hour:'numeric'})) + '</b>' : '') + '</span>';
  }
  let lanes = '';
  let laneCount = 0, burstCount = 0, promptCount = 0;
  for (const thread of report.threads){
    const key = threadKey(thread);
    if (state.instance && threadInstance(thread) !== state.instance) continue;
    let events = userEventsByThread.get(key) || [];
    if (state.q) events = events.filter(e => itemText(e).includes(state.q));
    if (!events.length) continue;
    laneCount += 1;
    promptCount += events.length;
    const dim = state.thread && state.thread !== key;
    let bubbles = '';
    for (const cluster of clusterUserEvents(events)){
      burstCount += 1;
      const count = cluster.events.length;
      const d = Math.round(Math.min(40, 11 + Math.sqrt(count - 1) * 7));
      const mid = (cluster.firstT + cluster.lastT) / 2;
      const first = cluster.events[0];
      const startLabel = fmt(new Date(cluster.firstT).toISOString());
      const endLabel = fmt(new Date(cluster.lastT).toISOString());
      const when = (count > 1 && endLabel !== startLabel) ? (startLabel + ' – ' + endLabel) : startLabel;
      const meta = instanceLabelForKey(key) + ' · ' + count + (count === 1 ? ' prompt · ' : ' prompts · ') + when;
      const preview = (first.text || '').replace(/\\s+/g, ' ').trim().slice(0, 240);
      bubbles += '<button class="act-bubble" type="button" style="left:' + activityX(mid).toFixed(2) + '%;width:' + d + 'px;height:' + d + 'px" data-eventid="event-' + esc(first.id) + '" data-title="' + esc(threadTitle(key)) + '" data-meta="' + esc(meta) + '" data-preview="' + esc(preview) + '"></button>';
    }
    lanes += '<div class="act-lane' + (dim ? ' dim' : '') + '" data-thread="' + esc(key) + '" style="--tc:' + threadColor(key) + '"><span class="act-gutter"><span class="dot" title="' + esc(threadTitle(key)) + '"></span></span><span class="act-track"><span class="act-baseline"></span>' + bubbles + '</span></div>';
  }
  byId('count').textContent = laneCount ? (promptCount + ' prompts · ' + burstCount + ' bursts') : '0 prompts';
  if (!laneCount){
    activity.innerHTML = '<div class="act-empty">No user prompts match the current filters.</div>';
    return;
  }
  const summary = '<div class="act-summary"><b>' + promptCount + '</b> prompts in <b>' + burstCount + '</b> bursts across <b>' + laneCount + '</b> session' + (laneCount === 1 ? '' : 's') + ' · each bubble is a cluster of your prompts (size = how many). Hover for detail, click to open it in the transcript.</div>';
  activity.innerHTML = summary
    + '<div class="act-axis"><span></span><span class="act-axis-track">' + ticks + '</span></div>'
    + '<div class="act-lanes"><span class="act-grid">' + gridlines + '</span>' + lanes + '</div>';
}
function jumpToEvent(eventId){
  byId('act-tip').classList.remove('show');
  const el = byId(eventId);
  if (!el) return;
  state.instance = el.dataset.instance || '';
  byId('instance-filter').value = state.instance;
  state.thread = '';
  state.userRole = true;
  byId('role-user').checked = true;
  state.view = 'chrono';
  applyView();
  el.classList.remove('hidden');
  el.scrollIntoView({block:'center'});
  el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1700);
}
function applyView(){
  byId('view-toggle').querySelectorAll('button').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
  const isActivity = state.view === 'activity';
  byId('expand-all').hidden = isActivity;
  byId('collapse-all').hidden = isActivity;
  if (!isActivity){
    const order = state.view === 'grouped' ? orderGrouped : orderChrono;
    const timeline = byId('timeline');
    for (const id of order){ const el = byId(id); if (el) timeline.appendChild(el); }
  }
  applyFilters();
}
function applyFilters(){
  clearThreadIfFilteredOut();
  refreshConversationList();
  document.querySelectorAll('.convo').forEach(c => c.classList.toggle('active', (c.dataset.thread || '') === state.thread));
  byId('scope').textContent = state.thread ? threadTitle(state.thread) : state.instance ? instanceLabel(state.instance) : 'All conversations';
  if (state.view === 'activity'){
    byId('timeline').hidden = true;
    byId('empty').hidden = true;
    byId('activity').hidden = false;
    renderActivity();
    return;
  }
  byId('timeline').hidden = false;
  byId('activity').hidden = true;
  let visible = 0;
  byId('timeline').querySelectorAll('.item').forEach(el => {
    const type = el.dataset.type;
    const role = el.dataset.role;
    const matchQuery = !state.q || (el.dataset.search || '').includes(state.q);
    const matchType = type === 'annotation' ? state.annotations : true;
    const matchInstance = !state.instance || el.dataset.instance === state.instance;
    const matchThread = !state.thread || el.dataset.thread === state.thread;
    const matchRole = type === 'annotation' ? true : ((role !== 'user' || state.userRole) && (role !== 'assistant' || state.assistantRole));
    const show = matchQuery && matchType && matchInstance && matchThread && matchRole;
    el.classList.toggle('hidden', !show);
    if (show) visible += 1;
  });
  byId('empty').hidden = visible !== 0;
  byId('count').textContent = visible === TOTAL ? (TOTAL + ' messages') : (visible + ' of ' + TOTAL + ' shown');
  byId('timeline').classList.toggle('focused', !!state.thread);
  refreshGroupDividers();
  updateCurrentGroup();
}
function selectThread(key){
  state.thread = key;
  document.querySelectorAll('.convo').forEach(c => c.classList.toggle('active', (c.dataset.thread || '') === key));
  byId('scope').textContent = key ? threadTitle(key) : 'All conversations';
  byId('timeline').classList.toggle('focused', !!key);
  applyFilters();
  window.scrollTo({top:0,behavior:'smooth'});
}

const THEME_KEY = 'agentlens-theme';
function applyTheme(theme){
  document.documentElement.dataset.theme = theme;
  byId('theme-icon').textContent = theme === 'dark' ? '☀' : '☾';
  try { localStorage.setItem(THEME_KEY, theme); } catch (e) {}
}
function initTheme(){
  let theme = '';
  try { theme = localStorage.getItem(THEME_KEY) || ''; } catch (e) {}
  if (!theme) theme = (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) ? 'dark' : 'light';
  applyTheme(theme);
}

function bind(){
  byId('search').addEventListener('input', e => { state.q = e.target.value.toLowerCase(); applyFilters(); });
  byId('show-annotations').addEventListener('change', e => { state.annotations = e.target.checked; applyFilters(); });
  byId('role-user').addEventListener('change', e => { state.userRole = e.target.checked; applyFilters(); });
  byId('role-assistant').addEventListener('change', e => { state.assistantRole = e.target.checked; applyFilters(); });
  byId('instance-filter').addEventListener('change', e => { state.instance = e.target.value; applyFilters(); });
  byId('conversation-order').addEventListener('change', e => { state.conversationOrder = e.target.value; renderConversationList(); applyFilters(); });
  byId('expand-all').addEventListener('click', () => setAllExpanded(true));
  byId('collapse-all').addEventListener('click', () => setAllExpanded(false));
  document.querySelector('.sidebar').addEventListener('click', e => {
    const summaryButton = e.target.closest('[data-summary-thread]');
    if (summaryButton) {
      e.preventDefault();
      e.stopPropagation();
      openSummaryModal(summaryButton.dataset.summaryThread || '');
      return;
    }
    const convo = e.target.closest('.convo');
    if (convo) selectThread(convo.dataset.thread || '');
  });
  document.querySelector('.sidebar').addEventListener('keydown', e => {
    const convo = e.target.closest('.convo[role="button"]');
    if (!convo || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    selectThread(convo.dataset.thread || '');
  });
  byId('view-toggle').addEventListener('click', e => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    state.view = btn.dataset.view;
    applyView();
  });
  byId('theme-toggle').addEventListener('click', () => {
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  const activityEl = byId('activity');
  const actTip = byId('act-tip');
  activityEl.addEventListener('mouseover', e => {
    const bubble = e.target.closest('.act-bubble');
    if (!bubble) return;
    const lane = bubble.closest('.act-lane');
    actTip.style.setProperty('--tc', lane ? lane.style.getPropertyValue('--tc') : 'var(--faint)');
    actTip.innerHTML = '<div class="tt"><span class="dot"></span>' + esc(bubble.dataset.title) + '</div><div class="tm">' + esc(bubble.dataset.meta) + '</div>' + (bubble.dataset.preview ? '<div class="tp">' + esc(bubble.dataset.preview) + '</div>' : '');
    actTip.style.left = (e.clientX + 16) + 'px';
    actTip.style.top = (e.clientY + 18) + 'px';
    actTip.classList.add('show');
  });
  activityEl.addEventListener('mousemove', e => {
    if (!actTip.classList.contains('show')) return;
    let x = e.clientX + 16, y = e.clientY + 18;
    if (x + actTip.offsetWidth > window.innerWidth - 8) x = e.clientX - actTip.offsetWidth - 16;
    if (y + actTip.offsetHeight > window.innerHeight - 8) y = e.clientY - actTip.offsetHeight - 18;
    actTip.style.left = Math.max(8, x) + 'px';
    actTip.style.top = Math.max(8, y) + 'px';
  });
  activityEl.addEventListener('mouseout', e => {
    const bubble = e.target.closest('.act-bubble');
    if (!bubble) return;
    if (e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.act-bubble') === bubble) return;
    actTip.classList.remove('show');
  });
  activityEl.addEventListener('click', e => {
    const bubble = e.target.closest('.act-bubble');
    if (bubble) jumpToEvent(bubble.dataset.eventid);
  });
  const toTop = byId('to-top');
  toTop.addEventListener('click', () => window.scrollTo({top:0,behavior:'smooth'}));
  byId('summary-modal-close').addEventListener('click', closeSummaryModal);
  byId('summary-modal').addEventListener('click', e => {
    if (e.target === byId('summary-modal')) closeSummaryModal();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !byId('summary-modal').hidden) closeSummaryModal();
  });
  window.addEventListener('scroll', () => { toTop.classList.toggle('show', window.scrollY > 700); scheduleCurrentGroup(); }, {passive:true});
  window.addEventListener('resize', () => { refreshOverflowToggles(); scheduleCurrentGroup(); });
}

initTheme();
renderSidebar();
renderTimeline();
bind();
applyFilters();
</script>
</body>
</html>`;
}

function escapeScriptJson(json: string): string {
  return json.replace(/</gu, "\\u003c").replace(/>/gu, "\\u003e").replace(/&/gu, "\\u0026");
}
