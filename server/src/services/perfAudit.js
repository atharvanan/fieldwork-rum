// Common third-party analytics / ad domains to identify script impact
const KNOWN_THIRD_PARTIES = [
  'google-analytics.com',
  'googletagmanager.com',
  'facebook.net',
  'connect.facebook.net',
  'doubleclick.net',
  'clarity.ms',
  'hotjar.com',
  'segment.io',
  'intercom.io',
  'tiktok.com',
  'criteo.com',
  'sentry.io',
  'datadoghq-browser-agent.com',
];

function parseHtmlElements(html) {
  const elements = [];
  const tagRegex = /<([a-zA-Z0-9:-]+)([^>]*?)(\/?)>|([^<]+)/g;
  let match;

  while ((match = tagRegex.exec(html)) !== null) {
    if (match[1]) {
      const tagName = match[1].toLowerCase();
      const rawAttrs = match[2];
      const isSelfClosing = match[3] === '/' || ['img', 'input', 'br', 'hr', 'meta', 'link'].includes(tagName);

      const attrs = {};
      const attrRegex = /([a-zA-Z0-9:-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^>\s]+)))?/g;
      let attrMatch;
      while ((attrMatch = attrRegex.exec(rawAttrs)) !== null) {
        attrs[attrMatch[1].toLowerCase()] = attrMatch[2] ?? attrMatch[3] ?? attrMatch[4] ?? '';
      }

      elements.push({ tagName, attrs, isSelfClosing, raw: match[0].slice(0, 300) });
    }
  }
  return elements;
}

export async function runPerformanceAudit(url, { strategy = 'mobile' } = {}) {
  const startTime = Date.now();
  const isMobile = strategy === 'mobile';

  const browserHeaders = {
    'User-Agent': isMobile
      ? 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Sec-Ch-Ua': isMobile
      ? '"Chromium";v="124", "Android";v="13", "Not-A.Brand";v="99"'
      : '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': isMobile ? '?1' : '?0',
    'Sec-Ch-Ua-Platform': isMobile ? '"Android"' : '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  };

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);

  let res;
  let ttfb = 0;
  try {
    const fetchStart = Date.now();
    res = await fetch(url, { headers: browserHeaders, redirect: 'follow', signal: controller.signal });
    ttfb = Date.now() - fetchStart;
  } catch (err) {
    clearTimeout(timeoutId);
    return {
      url,
      status: 'failed',
      statusCode: 0,
      score: 0,
      strategy,
      vitals: {
        LCP: { value: 0, display: '0 ms', rating: 'poor' },
        FCP: { value: 0, display: '0 ms', rating: 'poor' },
        CLS: { value: 0, display: '0.000', rating: 'poor' },
        TBT: { value: 0, display: '0 ms', rating: 'poor' },
        TTFB: { value: 0, display: '0 ms', rating: 'poor' },
        SpeedIndex: { value: 0, display: '0 ms', rating: 'poor' },
      },
      metrics: { htmlBytes: 0, scriptsCount: 0, stylesheetsCount: 0, imagesCount: 0, renderBlockingCount: 0, thirdPartyCount: 0 },
      opportunities: [],
      durationMs: Date.now() - startTime,
      error: `Could not connect to URL: ${err.message}`,
    };
  } finally {
    clearTimeout(timeoutId);
  }

  let html = '';
  try {
    html = await res.text();
  } catch {
    html = '';
  }

  // Cap HTML to 8MB to protect memory
  if (html.length > 8 * 1024 * 1024) {
    html = html.slice(0, 8 * 1024 * 1024);
  }

  const elements = parseHtmlElements(html);

  // Group elements
  const scripts = elements.filter((e) => e.tagName === 'script');
  const stylesheets = elements.filter((e) => e.tagName === 'link' && e.attrs.rel === 'stylesheet');
  const images = elements.filter((e) => e.tagName === 'img');
  const links = elements.filter((e) => e.tagName === 'link');

  // Render-blocking resources
  const renderBlockingScripts = scripts.filter((s) => {
    return s.attrs.src && !('async' in s.attrs) && !('defer' in s.attrs) && s.attrs.type !== 'module';
  });

  const renderBlockingStyles = stylesheets.filter((s) => {
    return !s.attrs.media || s.attrs.media === 'all';
  });

  // Images analysis
  const imagesMissingDimensions = images.filter((img) => !img.attrs.width || !img.attrs.height);
  const modernImages = images.filter((img) => {
    const src = (img.attrs.src || '').toLowerCase();
    return src.endsWith('.webp') || src.endsWith('.avif') || src.includes('format=webp') || src.includes('format=avif');
  });

  // Web Fonts analysis (missing font-display=swap)
  const fontLinks = links.filter((l) => (l.attrs.href || '').includes('fonts.googleapis.com') || (l.attrs.href || '').endsWith('.woff2'));
  const fontsWithoutSwap = fontLinks.filter((l) => !(l.attrs.href || '').includes('display=swap'));

  // Preconnect / Preload hints
  const preconnects = links.filter((l) => l.attrs.rel === 'preconnect' || l.attrs.rel === 'dns-prefetch');

  // Third-party scripts count
  const thirdPartyScripts = scripts.filter((s) => {
    const src = (s.attrs.src || '').toLowerCase();
    return KNOWN_THIRD_PARTIES.some((tp) => src.includes(tp));
  });

  // Device simulation factors
  // Mobile has higher simulated network RTT and lower CPU power
  const rttFactor = isMobile ? 1.4 : 1.0;
  const cpuFactor = isMobile ? 1.3 : 0.9;

  // 1. First Contentful Paint (FCP)
  const fcpEst = Math.round(
    ttfb +
    (renderBlockingStyles.length * (isMobile ? 130 : 90) * rttFactor) +
    (renderBlockingScripts.length * (isMobile ? 160 : 110) * cpuFactor) +
    Math.min(300, (html.length / 1024) * 2)
  );

  // 2. Largest Contentful Paint (LCP)
  const hasHeroImage = images.length > 0;
  const heroDelay = hasHeroImage ? (isMobile ? 480 : 320) : (isMobile ? 220 : 150);
  const lcpEst = Math.round(fcpEst + heroDelay);

  // 3. Cumulative Layout Shift (CLS)
  const unsizedPenalty = imagesMissingDimensions.length * 0.035;
  const fontShiftPenalty = fontsWithoutSwap.length * 0.04;
  const stylesheetShiftPenalty = stylesheets.length > 6 ? 0.03 : 0.01;
  const clsEst = +Math.min(0.85, Math.max(0, unsizedPenalty + fontShiftPenalty + stylesheetShiftPenalty)).toFixed(3);

  // 4. Total Blocking Time (TBT)
  const blockingScriptWeight = renderBlockingScripts.length * (isMobile ? 95 : 60);
  const totalScriptWeight = Math.min(500, scripts.length * (isMobile ? 18 : 10));
  const tbtEst = Math.round(blockingScriptWeight + totalScriptWeight);

  // 5. Speed Index
  const speedIndexEst = Math.round(fcpEst + (lcpEst - fcpEst) * 0.55);

  // Lighthouse 10 Scoring Calculation
  // LCP: 25% | TBT: 30% | CLS: 25% | FCP: 10% | Speed Index: 10%
  let score = 100;
  if (lcpEst > 2500) score -= Math.min(25, ((lcpEst - 2500) / 2000) * 25);
  if (tbtEst > 200) score -= Math.min(30, ((tbtEst - 200) / 400) * 30);
  if (clsEst > 0.1) score -= Math.min(25, ((clsEst - 0.1) / 0.15) * 25);
  if (fcpEst > 1800) score -= Math.min(10, ((fcpEst - 1800) / 1200) * 10);
  if (speedIndexEst > 3400) score -= Math.min(10, ((speedIndexEst - 3400) / 2000) * 10);
  score = Math.max(5, Math.min(100, Math.round(score)));

  // Actionable Opportunities
  const opportunities = [];

  const totalBlocking = renderBlockingStyles.length + renderBlockingScripts.length;
  if (totalBlocking > 0) {
    const savingsMs = Math.round((renderBlockingStyles.length * 120) + (renderBlockingScripts.length * 150));
    opportunities.push({
      id: 'render-blocking-resources',
      title: 'Eliminate render-blocking resources',
      impact: totalBlocking >= 4 ? 'critical' : totalBlocking >= 2 ? 'serious' : 'moderate',
      savings: `${savingsMs} ms`,
      description: `Identified ${renderBlockingStyles.length} blocking stylesheet(s) and ${renderBlockingScripts.length} blocking script(s). Load non-critical CSS asynchronously and add defer or async to script tags.`,
    });
  }

  if (imagesMissingDimensions.length > 0) {
    opportunities.push({
      id: 'unsized-images',
      title: 'Specify explicit width and height on image elements',
      impact: imagesMissingDimensions.length >= 5 ? 'critical' : imagesMissingDimensions.length >= 2 ? 'serious' : 'minor',
      savings: `${(imagesMissingDimensions.length * 0.035).toFixed(3)} CLS improvement`,
      description: `${imagesMissingDimensions.length} image(s) lack width/height attributes or aspect-ratio CSS. Always reserve layout space to prevent sudden layout shifts while images download.`,
    });
  }

  if (images.length > 2 && modernImages.length < images.length / 2) {
    opportunities.push({
      id: 'modern-image-formats',
      title: 'Serve images in next-gen formats (WebP or AVIF)',
      impact: 'moderate',
      savings: 'Estimated 35% payload reduction',
      description: `Only ${modernImages.length} of ${images.length} images use modern compression formats. Switching legacy JPEG and PNG files to WebP or AVIF provides smaller files and faster downloads.`,
    });
  }

  if (fontsWithoutSwap.length > 0) {
    opportunities.push({
      id: 'font-display-swap',
      title: 'Ensure text remains visible during webfont load',
      impact: 'moderate',
      savings: 'Faster text paint',
      description: `${fontsWithoutSwap.length} web font link(s) do not specify display=swap. Add &display=swap to your Google Fonts link to avoid Flash of Invisible Text (FOIT).`,
    });
  }

  if (ttfb > 700) {
    opportunities.push({
      id: 'slow-ttfb',
      title: 'Reduce initial server response time (TTFB)',
      impact: ttfb > 1500 ? 'critical' : 'serious',
      savings: `${Math.max(0, ttfb - 350)} ms`,
      description: `Root server response took ${ttfb} ms. Implement CDN edge caching, HTTP/2 or HTTP/3, and optimize database queries to reach sub-400 ms response times.`,
    });
  }

  if (thirdPartyScripts.length >= 3) {
    opportunities.push({
      id: 'third-party-scripts',
      title: 'Reduce third-party tracker and script execution impact',
      impact: 'minor',
      savings: `${thirdPartyScripts.length * 35} ms main-thread time`,
      description: `Found ${thirdPartyScripts.length} third-party tracking scripts. Defer tag managers and analytics until after the initial interaction using requestIdleCallback or Partytown.`,
    });
  }

  const rate = (name, val) => {
    if (name === 'LCP') return val <= 2500 ? 'good' : val <= 4000 ? 'needs-improvement' : 'poor';
    if (name === 'FCP') return val <= 1800 ? 'good' : val <= 3000 ? 'needs-improvement' : 'poor';
    if (name === 'CLS') return val <= 0.1 ? 'good' : val <= 0.25 ? 'needs-improvement' : 'poor';
    if (name === 'TBT') return val <= 200 ? 'good' : val <= 600 ? 'needs-improvement' : 'poor';
    if (name === 'TTFB') return val <= 800 ? 'good' : val <= 1800 ? 'needs-improvement' : 'poor';
    if (name === 'SpeedIndex') return val <= 3400 ? 'good' : val <= 5800 ? 'needs-improvement' : 'poor';
    return 'good';
  };

  const fmtDisplay = (name, val) => {
    if (name === 'CLS') return val.toFixed(3);
    if (val >= 1000) return `${(val / 1000).toFixed(2)} s`;
    return `${Math.round(val)} ms`;
  };

  const makeVital = (name, val) => ({
    value: val,
    display: fmtDisplay(name, val),
    rating: rate(name, val),
  });

  return {
    url,
    status: res.status >= 200 && res.status < 400 ? 'completed' : 'warning',
    statusCode: res.status,
    score,
    strategy,
    vitals: {
      LCP: makeVital('LCP', lcpEst),
      FCP: makeVital('FCP', fcpEst),
      CLS: makeVital('CLS', clsEst),
      TBT: makeVital('TBT', tbtEst),
      TTFB: makeVital('TTFB', ttfb),
      SpeedIndex: makeVital('SpeedIndex', speedIndexEst),
    },
    metrics: {
      htmlBytes: html.length,
      scriptsCount: scripts.length,
      stylesheetsCount: stylesheets.length,
      imagesCount: images.length,
      renderBlockingCount: totalBlocking,
      thirdPartyCount: thirdPartyScripts.length,
    },
    opportunities,
    durationMs: Date.now() - startTime,
    error: res.status >= 400 ? `Server returned HTTP ${res.status}` : undefined,
  };
}
