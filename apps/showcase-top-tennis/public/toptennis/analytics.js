/* Small, allowlisted gameplay funnel. Preview/development visits never call GA. */
(() => {
  'use strict';
  if (window.TennisAnalytics) return;

  const canonicalOrigin = 'https://toptennisgame.com';
  const measurementId = 'G-08T8BENLDR';
  const pageTitles = {
    '/x': 'Top Tennis � X game',
    '/x/': 'Top Tennis � X game',
    '/': 'Top Tennis — Free online tennis game',
    '/play/': 'Top Tennis — Play',
    '/how-to-play/': 'Top Tennis — How to play',
    '/tournament/': 'Top Tennis — Tournament',
    '/practice/': 'Top Tennis — Tennis practice',
    '/multiplayer/': 'Top Tennis — Multiplayer tennis',
    '/tennis-courts/': 'Top Tennis — Tennis courts',
    '/about/': 'Top Tennis — About',
    '/press/': 'Top Tennis — Press kit'
  };
  Object.assign(pageTitles,{'/account':'Top Tennis — Career','/rankings':'Top Tennis — Rankings','/auth/sign-in':'Top Tennis — Sign in','/auth/sign-up':'Top Tennis — Sign up','/auth/verify-email':'Top Tennis — Verify email','/auth/complete':'Top Tennis — Authentication','/auth/forgot-password':'Top Tennis — Password recovery','/auth/reset-password':'Top Tennis — Password reset'});
  let path = Object.hasOwn(pageTitles, location.pathname) ? location.pathname : '/other/';
  let pageTitle = pageTitles[path] || 'Top Tennis';
  const query = new URLSearchParams(location.search);
  const production = location.origin === canonicalOrigin;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  const debugEnabled = (local || production) && query.get('analytics_debug') === '1';
  const optedOut=()=>{try{return localStorage.getItem('toptennis.analytics.v2.optout')==='true';}catch{return false;}};
  const privacyPreference = navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'||optedOut();
  const collect = production && !debugEnabled && !privacyPreference;
  const enabled = collect || debugEnabled;
  const modes = new Set(['single', 'practice', 'tournament', 'online']);
  const failureReasons = new Set(['webgl_unavailable', 'renderer_unavailable', 'webgl_context_lost', 'script_load_failed', 'runtime_error', 'game_boot_failed']);
  const referralPartners = {
    freegameplanet: 'freegameplanet.com', alphabetagamer: 'alphabetagamer.com', itch: 'itch.io',
    newgrounds: 'newgrounds.com', indiegamesplus: 'indiegamesplus.com', crazygames: 'crazygames.com', poki: 'poki.com',
    kongregate: 'kongregate.com', y8: 'y8.com', gamepix: 'gamepix.com', playgama: 'playgama.com'
  };
  const knownSources = new Set(['direct', 'organic_google', 'organic_bing', 'organic_duckduckgo', 'organic_yahoo', 'ai_chatgpt', 'ai_perplexity', 'ai_claude', 'social', 'referral', 'campaign',
    ...Object.keys(referralPartners).map(partner => 'referral_' + partner)]);
  const sourceOrigins = {
    organic_google: 'https://www.google.com/', organic_bing: 'https://www.bing.com/',
    organic_duckduckgo: 'https://duckduckgo.com/', organic_yahoo: 'https://search.yahoo.com/',
    ai_chatgpt: 'https://chatgpt.com/', ai_perplexity: 'https://www.perplexity.ai/', ai_claude: 'https://claude.ai/'
  };
  const hostIs = (host, domain) => host === domain || host.endsWith('.' + domain);
  function sourceFromHost(host) {
    if (hostIs(host, 'chatgpt.com') || hostIs(host, 'chat.openai.com')) return 'ai_chatgpt';
    if (hostIs(host, 'perplexity.ai')) return 'ai_perplexity';
    if (hostIs(host, 'claude.ai')) return 'ai_claude';
    if (/^(?:www\.)?google\.(?:com|co\.uk|ca|com\.au|de|fr|it|es|co\.in|ae)$/.test(host)) return 'organic_google';
    if (hostIs(host, 'bing.com')) return 'organic_bing';
    if (hostIs(host, 'duckduckgo.com')) return 'organic_duckduckgo';
    if (hostIs(host, 'search.yahoo.com')) return 'organic_yahoo';
    if (['facebook.com', 'instagram.com', 'reddit.com', 'youtube.com', 't.co', 'x.com', 'tiktok.com'].some(domain => hostIs(host, domain))) return 'social';
    for (const [partner, domain] of Object.entries(referralPartners)) {
      if (hostIs(host, domain)) return 'referral_' + partner;
    }
    return 'referral';
  }
  let referrer;
  try { referrer = new URL(document.referrer); } catch {}
  const externalReferrer = referrer && /^https?:$/.test(referrer.protocol) && !hostIs(referrer.hostname, 'toptennisgame.com') && referrer.origin !== location.origin;
  const referrerSource = externalReferrer ? sourceFromHost(referrer.hostname) : 'direct';
  // Fixed public origins only: never transmit a referrer's path, query, fragment,
  // credentials, or arbitrary hostname (which can contain a person's name).
  const safeReferrer = externalReferrer ? sourceOrigins[referrerSource] || '' : '';
  const campaignSource = (query.get('utm_source') || '').toLowerCase();
  const knownCampaigns = {
    chatgpt: 'ai_chatgpt', 'chatgpt.com': 'ai_chatgpt', perplexity: 'ai_perplexity', 'perplexity.ai': 'ai_perplexity',
    claude: 'ai_claude', 'claude.ai': 'ai_claude'
  };
  for (const [partner, domain] of Object.entries(referralPartners)) {
    knownCampaigns[partner] = 'referral_' + partner;
    knownCampaigns[domain] = 'referral_' + partner;
  }
  let source = Object.hasOwn(knownCampaigns, campaignSource) ? knownCampaigns[campaignSource] : campaignSource ? 'campaign' : referrerSource;
  let landing = true;
  const storageKey = 'toptennis.acquisition.v1';
  if (enabled) {
    try {
      const previous = JSON.parse(sessionStorage.getItem(storageKey));
      // A thirty-minute visit carries coarse attribution from guides into play.
      // New external visits/campaigns start a new acquisition journey.
      if (!externalReferrer && !campaignSource && knownSources.has(previous?.source) &&
          Number.isFinite(previous?.lastSeen) && Date.now() - previous.lastSeen >= 0 && Date.now() - previous.lastSeen < 30 * 60 * 1000) {
        source = previous.source;
        landing = false;
      }
      sessionStorage.setItem(storageKey, JSON.stringify({source, lastSeen: Date.now()}));
    } catch { /* Storage restrictions must never prevent play or page rendering. */ }
  }
  const touch = Boolean(window.matchMedia?.('(pointer: coarse)').matches);
  // The synchronous head script can run before the viewport meta is parsed.
  // The screen's short CSS dimension also keeps phone landscape classified as mobile.
  const deviceWidth = window.screen?.width && window.screen?.height ? Math.min(window.screen.width, window.screen.height) : window.innerWidth;
  const deviceType = touch ? (deviceWidth <= 600 ? 'mobile' : 'tablet') : 'desktop';
  const base = {page_location: canonicalOrigin + path, page_referrer: safeReferrer,
    page_title: pageTitle, page_path: path, device_type: deviceType, acquisition_source: source};
  const campaign = {campaign_source: source,
    campaign_medium: source.startsWith('organic_') ? 'organic' : source.startsWith('ai_') || source.startsWith('referral_') || source === 'referral' ? 'referral' : source === 'direct' ? '(none)' : source === 'social' ? 'social' : 'campaign',
    campaign_id: '(not set)', campaign_name: '(not set)', campaign_term: '(not set)', campaign_content: '(not set)'};
  const recorded = [];
  const failures = new Set();
  let activeMatch = null;

  let send;
  if (collect) {
    window.dataLayer = window.dataLayer || [];
    const gtag = function () { window.dataLayer.push(arguments); };
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('set', {...campaign, page_location: base.page_location, page_referrer: base.page_referrer, page_title: base.page_title});
    gtag('config', measurementId, {...campaign, send_page_view: false, allow_google_signals: false,
      allow_ad_personalization_signals: false, page_location: base.page_location,
      page_referrer: base.page_referrer, page_title: base.page_title});
    send = (name, parameters) => gtag('event', name, parameters);
    const script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + measurementId;
    document.head.appendChild(script);
  }
  function event(name, details = {}) {
    if (!enabled||optedOut()||navigator.globalPrivacyControl===true||navigator.doNotTrack==='1') return;
    const parameters = {...base, ...details};
    if (debugEnabled) {
      recorded.push({name, parameters});
      if (recorded.length > 200) recorded.shift();
    }
    send?.(name, parameters);
  }
  function loadFailure(reason) {
    if (path !== '/play/' || !failureReasons.has(reason) || failures.has(reason)) return;
    failures.add(reason);
    event('game_load_failure', {failure_reason: reason});
  }
  function tourParameters(details={}) {
    const params={game_mode:'tournament'};
    if(['dubai-open','los-angeles-open','monaco-open','roma-open','turin-finals','new-york-open','paris-open','london-open','sydney-open'].includes(details.eventId))params.tournament_id=details.eventId;
    if(['beginner','club','ace','pro','legend'].includes(details.difficulty))params.difficulty=details.difficulty;
    if(Number.isInteger(details.draw?.round)&&details.draw.round>=0&&details.draw.round<=4)params.tournament_round=details.draw.round+1;
    if(['active','champion','eliminated','withdrawn'].includes(details.status))params.tournament_status=details.status;
    return params;
  }
  let tourClock={last:null,active:false,milliseconds:0,parameters:null};
  function flushTourPlay(){
    const seconds=Math.floor(tourClock.milliseconds/1000);
    if(seconds&&tourClock.parameters?.tournament_id)event('tour_active_play',{...tourClock.parameters,active_seconds:seconds});
    tourClock.milliseconds=0;
  }
  window.addEventListener('pagehide',flushTourPlay);
  document.addEventListener?.('visibilitychange',()=>{if(document.hidden){flushTourPlay();tourClock.last=null;tourClock.active=false;}});
  window.TennisAnalytics = Object.freeze({
    route(next){
      next=Object.hasOwn(pageTitles,next)?next:'/other/';if(next===path)return;
      path=next;pageTitle=pageTitles[path]||'Top Tennis';Object.assign(base,{page_location:canonicalOrigin+path,page_path:path,page_title:pageTitle});event('page_view');window.TennisSummary?.route(path);
    },
    trackTourPlay(now,active,details={}) {
      if(!enabled)return;
      const parameters=tourParameters(details);
      active=!!active&&!document.hidden&&!!parameters.tournament_id;
      if(tourClock.parameters?.tournament_id!==parameters.tournament_id){flushTourPlay();tourClock.last=null;tourClock.active=false;}
      if(active&&tourClock.active&&tourClock.last!==null){const elapsed=now-tourClock.last;if(elapsed>0&&elapsed<=1000)tourClock.milliseconds+=elapsed;}
      if(active)tourClock.parameters=parameters;
      if(!active||tourClock.milliseconds>=30000)flushTourPlay();
      tourClock.last=now;tourClock.active=active;
    },
    tourEvent(name, details = {}) {
      if (!new Set(['tour_event_selected','tour_signup_started','tour_signup_completed','tour_run_started','tour_run_resumed','tour_round_completed','tour_run_finished','tour_save_failed','tour_next_event']).has(name)) return;
      event(name,tourParameters(details));
    },
    selectMode(mode) {
      if (modes.has(mode)) event('mode_selected', {game_mode: mode});
    },
    startMatch(mode) {
      if (!modes.has(mode)) return;
      activeMatch = {mode, started: Date.now()};
      event('match_started', {game_mode: mode});
    },
    completeMatch(won) {
      if (!activeMatch || activeMatch.mode === 'practice' || typeof won !== 'boolean') return;
      const match = activeMatch;
      activeMatch = null;
      event('match_completed', {game_mode: match.mode, match_result: won ? 'win' : 'loss',
        duration_seconds: Math.min(86400, Math.max(0, Math.round((Date.now() - match.started) / 1000)))});
    },
    abandonMatch() { activeMatch = null; },
    loadFailure,
    debug() {
      return {enabled, collecting: collect, debug: debugEnabled,source,
        events: recorded.map(item => ({name: item.name, parameters: {...item.parameters}}))};
    }
  });
  event('page_view');
  if (landing) event('landing');
  function privacyControl(){
    // Site footers render their own React control here; it may hydrate after this script runs.
    if(document.querySelector?.('.mp-footer-preferences'))return;
    const host=document.querySelector?.('.application-footer-bottom')||document.querySelector?.('footer')||document.querySelector?.('#pause-menu');if(!host||document.getElementById?.('analytics-preference'))return;
    const control=document.createElement('button');control.id='analytics-preference';control.type='button';control.className='text-button';
    const browserBlocked=navigator.doNotTrack==='1'||navigator.globalPrivacyControl===true;
    if(browserBlocked)return;
    control.textContent=optedOut()?'Allow optional analytics':'Turn off optional analytics';
    control.onclick=()=>{try{const disable=!optedOut();localStorage.setItem('toptennis.analytics.v2.optout',String(disable));window['ga-disable-'+measurementId]=disable;window.TennisSummary?.optOut(disable);if(!disable)location.reload();else control.textContent='Allow optional analytics';}catch{control.textContent='This preference could not be saved';}};
    host.appendChild(control);
  }
  if(document.readyState==='loading')document.addEventListener?.('DOMContentLoaded',privacyControl,{once:true});else privacyControl();
  // The same-origin config endpoint controls custom collection on staging too.
  // GA remains limited to the canonical production host.
  if(typeof fetch==='function'&&!privacyPreference){const summary=document.createElement('script');summary.src='/analytics-summary.js';summary.async=true;document.head.appendChild(summary);}

  if (path === '/play/') {
    // Error payloads deliberately contain a fixed reason only, never exception
    // messages/stack traces or asset URLs, which could contain invite secrets.
    window.addEventListener('error', error => {
      const target = error.target;
      if (target?.tagName === 'SCRIPT') {
        try { if (new URL(target.src, location.href).origin === location.origin) loadFailure('script_load_failed'); } catch {}
      } else if (error.filename) {
        try { if (new URL(error.filename, location.href).origin === location.origin) loadFailure('runtime_error'); } catch {}
      }
    }, true);
    window.addEventListener('load', () => {
      if (!window.TennisLocal || !window.TennisMenu) loadFailure('game_boot_failed');
    }, {once: true});
  }
})();
