/**
 * WCAG 2.1 / 2.2 Accessibility Evaluation Engine
 * Performs structural, semantic, landmark, form control, and contrast assessment.
 * Evaluates Conformance Levels A, AA, and AAA.
 */

// Relative luminance formula per W3C WCAG 2.1 spec
function parseColor(str) {
  if (!str) return null;
  const s = str.trim().toLowerCase();
  if (s.startsWith('#')) {
    let hex = s.slice(1);
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (hex.length === 6) {
      return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
    }
  }
  const rgbMatch = s.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    return [parseInt(rgbMatch[1], 10), parseInt(rgbMatch[2], 10), parseInt(rgbMatch[3], 10)];
  }
  const named = {
    white: [255, 255, 255],
    black: [0, 0, 0],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    red: [255, 0, 0],
    blue: [0, 0, 255],
  };
  return named[s] || null;
}

function relativeLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrastRatio(rgb1, rgb2) {
  const l1 = relativeLuminance(...rgb1);
  const l2 = relativeLuminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// Minimal HTML Tokenizer & DOM representation for server-side audit
function parseHtml(html) {
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

      elements.push({
        tagName,
        attrs,
        isSelfClosing,
        raw: match[0].slice(0, 300),
        startIndex: match.index,
      });
    }
  }

  return { html, elements };
}

/**
 * Executes a full WCAG compliance assessment on an HTML document.
 */
export async function auditPage(url, { targetLevel = 'AA', htmlContent } = {}) {
  const startTime = Date.now();
  let html = htmlContent;

  if (!html) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) FieldworkAccessibilityScanner/1.0',
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch page: HTTP ${response.status} ${response.statusText}`);
      }
      html = await response.text();
    } finally {
      clearTimeout(timeout);
    }
  }

  const { elements } = parseHtml(html);
  const violationsMap = new Map();
  let passesCount = 0;

  function addViolation(rule) {
    const existing = violationsMap.get(rule.ruleId);
    if (existing) {
      existing.nodes.push(...rule.nodes);
    } else {
      violationsMap.set(rule.ruleId, { ...rule });
    }
  }

  // 1. Language of Page (WCAG 3.1.1 - Level A)
  const htmlTag = elements.find((e) => e.tagName === 'html');
  if (!htmlTag || !htmlTag.attrs.lang || !htmlTag.attrs.lang.trim()) {
    addViolation({
      ruleId: 'html-has-lang',
      impact: 'serious',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag311'],
      description: 'The <html> element must have a valid lang attribute to announce text properly in screen readers.',
      help: 'Add a lang attribute to the <html> opening tag (e.g., lang="en").',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/language-of-page.html',
      nodes: [{ html: htmlTag?.raw || '<html>', target: ['html'], failureSummary: 'Missing lang attribute on <html> element' }],
    });
  } else {
    passesCount++;
  }

  // 2. Document Title (WCAG 2.4.2 - Level A)
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!titleTag || !titleTag[1].trim()) {
    addViolation({
      ruleId: 'document-title',
      impact: 'serious',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag242'],
      description: 'The document must have a descriptive, non-empty <title> element.',
      help: 'Add a descriptive <title> tag inside the document <head>.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/page-titled.html',
      nodes: [{ html: '<title></title>', target: ['head > title'], failureSummary: 'Document title is missing or empty' }],
    });
  } else {
    passesCount++;
  }

  // 3. Viewport Zoom Lock (WCAG 1.4.4 - Level AA)
  const metaViewports = elements.filter((e) => e.tagName === 'meta' && e.attrs.name === 'viewport');
  let zoomLocked = false;
  for (const m of metaViewports) {
    const content = (m.attrs.content || '').toLowerCase();
    if (content.includes('user-scalable=no') || content.includes('maximum-scale=1.0') || content.includes('maximum-scale=1')) {
      zoomLocked = true;
      addViolation({
        ruleId: 'meta-viewport-zoomable',
        impact: 'critical',
        wcagLevel: 'AA',
        wcagTags: ['wcag2aa', 'wcag144'],
        description: 'Zooming and scaling must not be disabled to accommodate low-vision users.',
        help: 'Remove user-scalable=no or maximum-scale=1 from the viewport meta tag.',
        helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/resize-text.html',
        nodes: [{ html: m.raw, target: ['meta[name="viewport"]'], failureSummary: 'user-scalable=no prevents text resizing up to 200%' }],
      });
    }
  }
  if (!zoomLocked) passesCount++;

  // 4. Image Alternative Text (WCAG 1.1.1 - Level A)
  const images = elements.filter((e) => e.tagName === 'img');
  let missingAltNodes = [];
  let redundantAltNodes = [];

  images.forEach((img, idx) => {
    if (img.attrs.alt === undefined) {
      missingAltNodes.push({
        html: img.raw,
        target: [img.attrs.id ? `#${img.attrs.id}` : `img:nth-of-type(${idx + 1})`],
        failureSummary: 'Element does not have an alt attribute',
      });
    } else {
      const altText = img.attrs.alt.trim().toLowerCase();
      if (['image', 'picture', 'photo', 'graphic', 'logo.png', 'img'].includes(altText)) {
        redundantAltNodes.push({
          html: img.raw,
          target: [img.attrs.id ? `#${img.attrs.id}` : `img:nth-of-type(${idx + 1})`],
          failureSummary: `Alt text "${img.attrs.alt}" is redundant and non-descriptive`,
        });
      }
    }
  });

  if (missingAltNodes.length > 0) {
    addViolation({
      ruleId: 'image-alt',
      impact: 'critical',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag111'],
      description: 'All <img> elements must have an alt attribute providing a text alternative.',
      help: 'Provide descriptive alt text for informative images or alt="" for decorative images.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
      nodes: missingAltNodes,
    });
  } else if (images.length > 0) {
    passesCount++;
  }

  if (redundantAltNodes.length > 0) {
    addViolation({
      ruleId: 'image-redundant-alt',
      impact: 'minor',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag111'],
      description: 'Image alternative text should not contain words like "image", "picture", or file extensions.',
      help: 'Describe the purpose and context of the image instead of stating it is an image.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/non-text-content.html',
      nodes: redundantAltNodes,
    });
  }

  // 5. Form Input Labels (WCAG 1.3.1, 4.1.2 - Level A)
  const inputs = elements.filter((e) => ['input', 'select', 'textarea'].includes(e.tagName));
  const labels = elements.filter((e) => e.tagName === 'label');
  const labelForIds = new Set(labels.map((l) => l.attrs.for).filter(Boolean));
  const missingLabelNodes = [];

  inputs.forEach((input, idx) => {
    const type = (input.attrs.type || 'text').toLowerCase();
    if (['hidden', 'submit', 'button', 'reset', 'image'].includes(type)) return;

    const hasAriaLabel = Boolean(input.attrs['aria-label'] || input.attrs['aria-labelledby']);
    const hasLabelFor = input.attrs.id && labelForIds.has(input.attrs.id);
    const hasTitle = Boolean(input.attrs.title);

    if (!hasAriaLabel && !hasLabelFor && !hasTitle) {
      missingLabelNodes.push({
        html: input.raw,
        target: [input.attrs.id ? `#${input.attrs.id}` : `${input.tagName}:nth-of-type(${idx + 1})`],
        failureSummary: 'Form control does not have an associated label or aria-label',
      });
    }
  });

  if (missingLabelNodes.length > 0) {
    addViolation({
      ruleId: 'label',
      impact: 'critical',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag131', 'wcag412'],
      description: 'Every form control must have an accessible label for assistive technologies.',
      help: 'Associate an explicit <label for="id"> or add an aria-label attribute to the input.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
      nodes: missingLabelNodes,
    });
  } else if (inputs.length > 0) {
    passesCount++;
  }

  // 6. Button Names & Accessible Text (WCAG 4.1.2 - Level A)
  const buttonRegex = /<button([^>]*)>([\s\S]*?)<\/button>/gi;
  const missingButtonNodes = [];
  let btnMatch;
  while ((btnMatch = buttonRegex.exec(html)) !== null) {
    const rawTag = btnMatch[0].slice(0, 250);
    const attrsStr = btnMatch[1];
    const innerContent = btnMatch[2].replace(/<[^>]+>/g, '').trim();

    const ariaLabelMatch = attrsStr.match(/aria-label=["']([^"']+)["']/i);
    const hasAria = ariaLabelMatch && ariaLabelMatch[1].trim().length > 0;

    if (!innerContent && !hasAria) {
      missingButtonNodes.push({
        html: rawTag,
        target: ['button'],
        failureSummary: 'Button has no visible text and no aria-label',
      });
    }
  }

  if (missingButtonNodes.length > 0) {
    addViolation({
      ruleId: 'button-name',
      impact: 'critical',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag412'],
      description: 'Buttons must have discernible, accessible text for screen readers.',
      help: 'Add visible text inside the <button> or provide an aria-label attribute.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/name-role-value.html',
      nodes: missingButtonNodes,
    });
  } else {
    passesCount++;
  }

  // 7. Generic Link Text (WCAG 2.4.4 - Level A & AA)
  const linkRegex = /<a([^>]*)>([\s\S]*?)<\/a>/gi;
  const genericLinkNodes = [];
  let linkMatch;
  const genericWords = new Set(['click here', 'here', 'more', 'read more', 'learn more', 'link', 'details']);

  while ((linkMatch = linkRegex.exec(html)) !== null) {
    const rawTag = linkMatch[0].slice(0, 250);
    const innerContent = linkMatch[2].replace(/<[^>]+>/g, '').trim().toLowerCase();
    const hasAria = /aria-label=["'][^"']+["']/i.test(linkMatch[1]);

    if (!hasAria && genericWords.has(innerContent)) {
      genericLinkNodes.push({
        html: rawTag,
        target: ['a'],
        failureSummary: `Link text "${innerContent}" is ambiguous outside context`,
      });
    }
  }

  if (genericLinkNodes.length > 0) {
    addViolation({
      ruleId: 'link-name-discernible',
      impact: 'serious',
      wcagLevel: 'AA',
      wcagTags: ['wcag2aa', 'wcag244'],
      description: 'Links must have meaningful purpose discernible from link text alone or programmatically determined.',
      help: 'Replace generic words like "click here" or "read more" with specific descriptive destinations.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/link-purpose-in-context.html',
      nodes: genericLinkNodes,
    });
  } else {
    passesCount++;
  }

  // 8. Heading Hierarchy (WCAG 1.3.1, 2.4.6 - Level AA)
  const headingMatches = [...html.matchAll(/<(h[1-6])[^>]*>/gi)];
  let headingOrderValid = true;
  let lastLevel = 0;
  const skippedHeadings = [];

  headingMatches.forEach((m) => {
    const level = parseInt(m[1][1], 10);
    if (lastLevel > 0 && level > lastLevel + 1) {
      headingOrderValid = false;
      skippedHeadings.push({
        html: m[0],
        target: [m[1].toLowerCase()],
        failureSummary: `Skipped heading level from <h${lastLevel}> directly to <h${level}>`,
      });
    }
    lastLevel = level;
  });

  const hasH1 = headingMatches.some((m) => m[1].toLowerCase() === 'h1');
  if (!hasH1 && headingMatches.length > 0) {
    addViolation({
      ruleId: 'page-has-h1',
      impact: 'moderate',
      wcagLevel: 'AA',
      wcagTags: ['wcag2aa', 'wcag131'],
      description: 'Pages should contain a top-level <h1> heading marking the primary topic.',
      help: 'Add an <h1> heading to identify the primary content of the page.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/section-headings.html',
      nodes: [{ html: '<body>', target: ['body'], failureSummary: 'No <h1> heading found on the page' }],
    });
  } else {
    passesCount++;
  }

  if (!headingOrderValid) {
    addViolation({
      ruleId: 'heading-order',
      impact: 'moderate',
      wcagLevel: 'AA',
      wcagTags: ['wcag2aa', 'wcag131'],
      description: 'Heading levels should only increase by one level at a time without skipping.',
      help: 'Restructure heading tags to maintain an orderly sequence (h1 -> h2 -> h3).',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
      nodes: skippedHeadings,
    });
  } else {
    passesCount++;
  }

  // 9. Landmarks: Main Region (WCAG 1.3.1 - Level A)
  const hasMainLandmark = elements.some((e) => e.tagName === 'main' || e.attrs.role === 'main');
  if (!hasMainLandmark) {
    addViolation({
      ruleId: 'landmark-one-main',
      impact: 'moderate',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag131'],
      description: 'Document should have a <main> landmark indicating primary content.',
      help: 'Wrap your central page content in a <main> HTML element.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/info-and-relationships.html',
      nodes: [{ html: '<body>', target: ['body'], failureSummary: 'No <main> landmark detected' }],
    });
  } else {
    passesCount++;
  }

  // 10. Avoid Positive Tabindex (WCAG 2.4.3 - Level A)
  const positiveTabindexNodes = [];
  elements.forEach((e) => {
    const tabIndex = parseInt(e.attrs.tabindex, 10);
    if (!isNaN(tabIndex) && tabIndex > 0) {
      positiveTabindexNodes.push({
        html: e.raw,
        target: [e.attrs.id ? `#${e.attrs.id}` : e.tagName],
        failureSummary: `tabindex="${tabIndex}" disrupts natural sequential navigation order`,
      });
    }
  });

  if (positiveTabindexNodes.length > 0) {
    addViolation({
      ruleId: 'tabindex-positive',
      impact: 'serious',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag243'],
      description: 'Avoid tabindex greater than 0 as it breaks the logical reading order.',
      help: 'Use tabindex="0" to insert into tab order or tabindex="-1" to make focusable via script.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/focus-order.html',
      nodes: positiveTabindexNodes,
    });
  } else {
    passesCount++;
  }

  // 11. Duplicate ID Validation (WCAG 4.1.1 - Level A)
  const idCounts = new Map();
  elements.forEach((e) => {
    if (e.attrs.id) {
      const id = e.attrs.id.trim();
      idCounts.set(id, (idCounts.get(id) || 0) + 1);
    }
  });

  const duplicateIdNodes = [];
  idCounts.forEach((count, id) => {
    if (count > 1) {
      duplicateIdNodes.push({
        html: `id="${id}"`,
        target: [`#${id}`],
        failureSummary: `The id "${id}" is used ${count} times on the page`,
      });
    }
  });

  if (duplicateIdNodes.length > 0) {
    addViolation({
      ruleId: 'duplicate-id',
      impact: 'serious',
      wcagLevel: 'A',
      wcagTags: ['wcag2a', 'wcag411'],
      description: 'Element ID attributes must be unique to prevent breaking assistive references.',
      help: 'Rename duplicate ID attributes so every ID is globally unique.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/parsing.html',
      nodes: duplicateIdNodes,
    });
  } else {
    passesCount++;
  }

  // 12. Inline Style Color Contrast Inspection (WCAG 1.4.3 Level AA & 1.4.6 Level AAA)
  const contrastNodesAA = [];
  const contrastNodesAAA = [];

  elements.forEach((e) => {
    const style = e.attrs.style || '';
    if (style.includes('color:') && (style.includes('background:') || style.includes('background-color:'))) {
      const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/i);
      const bgMatch = style.match(/(?:^|;)\s*background(?:-color)?:\s*([^;]+)/i);
      if (colorMatch && bgMatch) {
        const fg = parseColor(colorMatch[1]);
        const bg = parseColor(bgMatch[1]);
        if (fg && bg) {
          const ratio = contrastRatio(fg, bg);
          if (ratio < 4.5) {
            contrastNodesAA.push({
              html: e.raw,
              target: [e.attrs.id ? `#${e.attrs.id}` : e.tagName],
              failureSummary: `Contrast ratio is ${ratio.toFixed(2)}:1 (Minimum required for Level AA is 4.5:1)`,
            });
          } else if (ratio < 7.0) {
            contrastNodesAAA.push({
              html: e.raw,
              target: [e.attrs.id ? `#${e.attrs.id}` : e.tagName],
              failureSummary: `Contrast ratio is ${ratio.toFixed(2)}:1 (Enhanced requirement for Level AAA is 7.0:1)`,
            });
          }
        }
      }
    }
  });

  if (contrastNodesAA.length > 0) {
    addViolation({
      ruleId: 'color-contrast',
      impact: 'serious',
      wcagLevel: 'AA',
      wcagTags: ['wcag2aa', 'wcag143'],
      description: 'Text elements must have a contrast ratio of at least 4.5:1 against the background.',
      help: 'Adjust font or background colors to meet minimum 4.5:1 contrast requirements.',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html',
      nodes: contrastNodesAA,
    });
  }

  if (contrastNodesAAA.length > 0 && targetLevel === 'AAA') {
    addViolation({
      ruleId: 'color-contrast-enhanced',
      impact: 'moderate',
      wcagLevel: 'AAA',
      wcagTags: ['wcag2aaa', 'wcag146'],
      description: 'Enhanced contrast requires a ratio of at least 7:1 for normal body text.',
      help: 'Darken text or lighten background to achieve high-contrast readability (7:1).',
      helpUrl: 'https://www.w3.org/WAI/WCAG21/Understanding/contrast-enhanced.html',
      nodes: contrastNodesAAA,
    });
  }

  // Compile violation metrics
  const violations = Array.from(violationsMap.values());
  const byImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const byWcag = { A: 0, AA: 0, AAA: 0 };

  violations.forEach((v) => {
    if (byImpact[v.impact] !== undefined) byImpact[v.impact] += v.nodes.length;
    if (byWcag[v.wcagLevel] !== undefined) byWcag[v.wcagLevel] += v.nodes.length;
  });

  // Weighted Compliance Score (0 to 100)
  const penalty = byImpact.critical * 12 + byImpact.serious * 6 + byImpact.moderate * 2 + byImpact.minor * 1;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));
  const durationMs = Date.now() - startTime;

  return {
    url,
    targetLevel,
    score,
    status: 'completed',
    summary: {
      violationsCount: violations.reduce((acc, v) => acc + v.nodes.length, 0),
      passesCount,
      byImpact,
      byWcag,
    },
    violations,
    durationMs,
  };
}
