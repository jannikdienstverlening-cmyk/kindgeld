(function() {
  'use strict';
  var GA_ID = 'G-XXXXXXXXXX';
  var CONSENT_KEY = 'kg_cookie_consent';
  var consent = localStorage.getItem(CONSENT_KEY);

  function loadGA() {
    if (window._gaLoaded) return;
    window._gaLoaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function(){ window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
  }

  function blockGA() {
    window['ga-disable-' + GA_ID] = true;
  }

  // Handle existing consent
  if (consent === 'all') { loadGA(); return; }
  if (consent === 'necessary') { blockGA(); return; }

  // No consent yet — show banner
  function showBanner() {
    var css = `
      #kg-cb { position:fixed; bottom:0; right:20px; z-index:9999; max-width:420px; width:calc(100% - 40px);
        background:#fff; border-radius:18px 18px 0 0; box-shadow:0 -4px 28px rgba(0,0,0,0.14);
        padding:24px 22px 20px; font-family:'Nunito',sans-serif; transform:translateY(100%);
        transition:transform 0.4s cubic-bezier(.34,1.4,.64,1); }
      #kg-cb.show { transform:translateY(0); }
      #kg-cb-title { font-size:16px; font-weight:800; color:#1a1a1a; margin-bottom:6px; }
      #kg-cb-sub { font-size:13px; color:#6b7280; line-height:1.6; margin-bottom:16px; }
      #kg-cb-sub a { color:#1D9E75; }
      #kg-cb-btns { display:flex; gap:8px; flex-wrap:wrap; }
      #kg-cb-all { flex:1; min-width:140px; padding:11px 16px; background:linear-gradient(135deg,#1D9E75,#085041);
        color:#fff; border:none; border-radius:11px; font-family:'Nunito',sans-serif; font-size:13px;
        font-weight:800; cursor:pointer; transition:filter 0.2s; }
      #kg-cb-all:hover { filter:brightness(1.08); }
      #kg-cb-nec { flex:1; min-width:120px; padding:11px 12px; background:#fff; color:#1a1a1a;
        border:1.5px solid rgba(0,0,0,0.12); border-radius:11px; font-family:'Nunito',sans-serif;
        font-size:13px; font-weight:700; cursor:pointer; transition:background 0.15s; }
      #kg-cb-nec:hover { background:#f5f5f0; }
      #kg-cb-set { font-size:12px; color:#6b7280; background:none; border:none; cursor:pointer;
        font-family:'Nunito',sans-serif; font-weight:600; padding:8px 4px; text-decoration:underline; }
      @media(max-width:480px){ #kg-cb { right:0; width:100%; border-radius:18px 18px 0 0; } }
    `;
    var style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);

    var banner = document.createElement('div');
    banner.id = 'kg-cb';
    banner.innerHTML =
      '<div id="kg-cb-title">🍪 Wij gebruiken cookies</div>' +
      '<div id="kg-cb-sub">We gebruiken cookies om de website te verbeteren en bezoekersstatistieken bij te houden. ' +
      'Lees ons <a href="cookiebeleid.html">cookiebeleid</a> voor meer informatie.</div>' +
      '<div id="kg-cb-btns">' +
        '<button id="kg-cb-all">Alles accepteren</button>' +
        '<button id="kg-cb-nec">Alleen noodzakelijk</button>' +
        '<button id="kg-cb-set">Instellingen</button>' +
      '</div>';
    document.body.appendChild(banner);

    setTimeout(function(){ banner.classList.add('show'); }, 50);

    document.getElementById('kg-cb-all').addEventListener('click', function(){
      localStorage.setItem(CONSENT_KEY, 'all');
      loadGA();
      banner.classList.remove('show');
      setTimeout(function(){ banner.remove(); }, 400);
    });
    document.getElementById('kg-cb-nec').addEventListener('click', function(){
      localStorage.setItem(CONSENT_KEY, 'necessary');
      blockGA();
      banner.classList.remove('show');
      setTimeout(function(){ banner.remove(); }, 400);
    });
    document.getElementById('kg-cb-set').addEventListener('click', function(){
      window.location.href = 'cookiebeleid.html';
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(showBanner, 600); });
  } else {
    setTimeout(showBanner, 600);
  }
})();
