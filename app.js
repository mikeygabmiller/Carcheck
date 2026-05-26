/* ============================================================================
   SECOND OPINION — app.js
   Handles view switching, share/copy/screenshot, and renders results.
   Backend swap-in point is marked clearly below.
   ============================================================================ */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // DOM refs
  // ---------------------------------------------------------------------------
  const $ = (id) => document.getElementById(id);

  const views = {
    input: $('input-view'),
    loading: $('loading-view'),
    result: $('result-view'),
    error: $('error-view'),
  };

  const form = $('check-form');
  const submitBtn = $('submit-btn');
  const backBtn = $('back-btn');
  const errorBackBtn = $('error-back-btn');
  const anotherBtn = $('another-btn');
  const screenshotBtn = $('screenshot-btn');
  const copyBtn = $('copy-btn');
  const shareLinkBtn = $('share-link-btn');
  const copySellerBtn = $('copy-seller-btn');
  const shareFriendBtn = $('share-friend-btn');
  const toast = $('toast');
  const footerYear = $('footer-year');
  const loadingSteps = document.querySelectorAll('.loading-step');

  if (footerYear) footerYear.textContent = new Date().getFullYear();

  // ---------------------------------------------------------------------------
  // View switching
  // ---------------------------------------------------------------------------
  function showView(name) {
    Object.values(views).forEach((v) => v && v.classList.add('hidden'));
    if (views[name]) views[name].classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // ---------------------------------------------------------------------------
  // Toast
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  // ---------------------------------------------------------------------------
  // Loading step animation
  // ---------------------------------------------------------------------------
  let loadingInterval = null;
  function animateLoadingSteps() {
    let i = 0;
    loadingSteps.forEach((s) => s.classList.remove('active', 'done'));
    if (loadingSteps[0]) loadingSteps[0].classList.add('active');
    loadingInterval = setInterval(() => {
      if (loadingSteps[i]) {
        loadingSteps[i].classList.remove('active');
        loadingSteps[i].classList.add('done');
      }
      i++;
      if (loadingSteps[i]) loadingSteps[i].classList.add('active');
      if (i >= loadingSteps.length) clearInterval(loadingInterval);
    }, 3500);
  }
  function stopLoadingSteps() {
    clearInterval(loadingInterval);
  }

  // ---------------------------------------------------------------------------
  // Render result into the report card
  // Expected `result` shape (design against this, then make backend match):
  // {
  //   subject: "2017 Honda Civic LX · 87,400 mi",
  //   grade: "C+",                    // A+, A, A-, B+, B, B-, C+, C, C-, D, F
  //   gradeBurn: "One-line summary of why",
  //   asking: 8500,
  //   fairLow: 6200,
  //   fairHigh: 7400,
  //   priceVerdict: "Overpriced",     // "Fair", "Underpriced", "Overpriced"
  //   watch: ["Problem 1", "Problem 2", "Problem 3"],
  //   note: "Mikey-voiced honest take, 1-3 sentences.",
  //   sellerMessage: "Polite offer message to the seller."
  // }
  // ---------------------------------------------------------------------------
  function renderResult(result) {
    // Subject
    $('rc-subject-text').textContent = result.subject || 'Used car listing';

    // Date stamp
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).toUpperCase();
    $('rc-date').textContent = `REPORT DATED ${dateStr}`;

    // Grade
    const gradeEl = $('rc-grade');
    gradeEl.textContent = result.grade || '—';
    gradeEl.className = 'rc-grade ' + gradeClassFor(result.grade);
    $('rc-grade-burn').textContent = result.gradeBurn || '';

    // Price block
    $('rc-asking').textContent = result.asking ? `$${Number(result.asking).toLocaleString()}` : '—';
    if (result.fairLow && result.fairHigh) {
      $('rc-fair').textContent = `$${Number(result.fairLow).toLocaleString()} – $${Number(result.fairHigh).toLocaleString()}`;
    } else {
      $('rc-fair').textContent = '—';
    }
    const verdictEl = $('rc-price-verdict');
    verdictEl.textContent = result.priceVerdict || '—';
    verdictEl.className = 'rc-cell-value ' + priceVerdictClass(result.priceVerdict);

    // Set asking color based on verdict too
    const askEl = $('rc-asking');
    askEl.className = 'rc-cell-value ' + priceVerdictClass(result.priceVerdict);

    // Stamp (top-right)
    const stampEl = $('rc-stamp');
    const stampText = stampFor(result.grade);
    stampEl.textContent = stampText.text;
    stampEl.style.color = stampText.color;
    stampEl.style.borderColor = stampText.color;

    // Watch list
    const watchUl = $('rc-watch');
    watchUl.innerHTML = '';
    (result.watch || []).forEach((item, i) => {
      const li = document.createElement('li');
      const num = String(i + 1).padStart(2, '0');
      li.innerHTML = `<span class="rc-watch-num">${num}</span><span></span>`;
      li.querySelector('span:last-child').textContent = item;
      watchUl.appendChild(li);
    });

    // Mikey's note
    $('rc-note-text').textContent = result.note || '';

    // Seller message
    $('seller-message').textContent = result.sellerMessage || '';
  }

  function gradeClassFor(grade) {
    if (!grade) return 'rc-grade-c';
    const first = String(grade).trim().toUpperCase().charAt(0);
    return {
      'A': 'rc-grade-a',
      'B': 'rc-grade-b',
      'C': 'rc-grade-c',
      'D': 'rc-grade-d',
      'F': 'rc-grade-f',
    }[first] || 'rc-grade-c';
  }

  function priceVerdictClass(verdict) {
    if (!verdict) return '';
    const v = String(verdict).toLowerCase();
    if (v.includes('over')) return 'rc-cell-bad';
    if (v.includes('under')) return 'rc-cell-good';
    if (v.includes('fair') || v.includes('priced right')) return 'rc-cell-good';
    return 'rc-cell-warn';
  }

  function stampFor(grade) {
    if (!grade) return { text: 'CHECKED', color: '#7a7166' };
    const first = String(grade).trim().toUpperCase().charAt(0);
    if (first === 'A') return { text: 'BUY IT', color: '#2d6a3e' };
    if (first === 'B') return { text: 'WORTH A LOOK', color: '#2d6a3e' };
    if (first === 'C') return { text: 'INSPECT FIRST', color: '#a8721a' };
    if (first === 'D') return { text: 'WALK AWAY', color: '#b8341f' };
    if (first === 'F') return { text: 'HARD PASS', color: '#b8341f' };
    return { text: 'CHECKED', color: '#7a7166' };
  }

  // ---------------------------------------------------------------------------
  // Form submit — placeholder. Wire your backend call here.
  // ---------------------------------------------------------------------------
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const listing = $('listing').value.trim();
    const price = $('price').value;
    const vin = $('vin').value.trim();

    if (!listing || !price) {
      showToast('Add a listing and a price first');
      return;
    }

    submitBtn.disabled = true;
    showView('loading');
    animateLoadingSteps();

    try {
      // ============================================================
      // BACKEND CALL — replace this block with your Gemini fetch.
      // Return an object matching the shape documented in renderResult().
      // ============================================================
      const result = await runCheck({ listing, price, vin });

      stopLoadingSteps();
      renderResult(result);
      showView('result');
    } catch (err) {
      stopLoadingSteps();
      $('error-text').textContent = err && err.message
        ? err.message
        : "I couldn't process that listing. Try again with more detail in the description.";
      showView('error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Backend call — hits your Deno Deploy worker.
  // ---------------------------------------------------------------------------
  const API_URL = 'https://carcheck.mikeygabmiller.deno.net/';

  async function runCheck({ listing, price, vin }) {
    const payload = { listing, price: Number(price) };
    if (vin && vin.length === 17) payload.vin = vin.toUpperCase();

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || 'Server error. Try again.');
    }

    return data;
  }

  // ---------------------------------------------------------------------------
  // Navigation buttons
  // ---------------------------------------------------------------------------
  function goHome(e) {
    if (e) e.preventDefault();
    showView('input');
  }
  backBtn.addEventListener('click', goHome);
  errorBackBtn.addEventListener('click', goHome);
  anotherBtn.addEventListener('click', goHome);

  // ---------------------------------------------------------------------------
  // Screenshot the report card
  // ---------------------------------------------------------------------------
  screenshotBtn.addEventListener('click', async () => {
    const node = $('report-card');
    if (!node || typeof html2canvas === 'undefined') {
      showToast('Screenshot tool not loaded — try refresh');
      return;
    }
    screenshotBtn.disabled = true;
    const originalLabel = screenshotBtn.innerHTML;
    screenshotBtn.innerHTML = '<span class="share-icon">⏳</span> Saving...';

    try {
      const canvas = await html2canvas(node, {
        backgroundColor: '#fbf6ec',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      const subject = ($('rc-subject-text').textContent || 'report')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40);
      a.href = dataUrl;
      a.download = `second-opinion-${subject}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      showToast('Image saved');
    } catch (err) {
      console.error(err);
      showToast("Couldn't save image");
    } finally {
      screenshotBtn.innerHTML = originalLabel;
      screenshotBtn.disabled = false;
    }
  });

  // ---------------------------------------------------------------------------
  // Copy report (plain-text version)
  // ---------------------------------------------------------------------------
  copyBtn.addEventListener('click', async () => {
    const text = buildPlainTextReport();
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Report copied' : "Couldn't copy — try long-press");
  });

  function buildPlainTextReport() {
    const subject = $('rc-subject-text').textContent;
    const grade = $('rc-grade').textContent;
    const burn = $('rc-grade-burn').textContent;
    const asking = $('rc-asking').textContent;
    const fair = $('rc-fair').textContent;
    const verdict = $('rc-price-verdict').textContent;
    const watch = Array.from(document.querySelectorAll('#rc-watch li span:last-child'))
      .map((el, i) => `${i + 1}. ${el.textContent}`)
      .join('\n');
    const note = $('rc-note-text').textContent;

    return [
      `SECOND OPINION — ${subject}`,
      ``,
      `Grade: ${grade}`,
      burn,
      ``,
      `Asking: ${asking}`,
      `Fair range: ${fair}`,
      `Verdict: ${verdict}`,
      ``,
      `Watch for these:`,
      watch,
      ``,
      `Mikey's take:`,
      note,
      ``,
      `Free used car check — mikeygabmiller.github.io/Carcheck`,
      `Built by Mikey's Mobile Detailing in Snohomish County · mikeysdetailing.com`,
    ].join('\n');
  }

  // ---------------------------------------------------------------------------
  // Share link (Web Share API → fallback to copy)
  // ---------------------------------------------------------------------------
  shareLinkBtn.addEventListener('click', async () => {
    const url = window.location.href.split('?')[0].split('#')[0];
    const text = `I just used Second Opinion to grade a used car listing. Free tool: ${url}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Second Opinion — Used Car Check',
          text,
          url,
        });
        return;
      } catch (_) { /* user dismissed — fall through */ }
    }
    const ok = await copyToClipboard(url);
    showToast(ok ? 'Link copied' : "Couldn't copy link");
  });

  if (shareFriendBtn) {
    shareFriendBtn.addEventListener('click', (e) => {
      e.preventDefault();
      shareLinkBtn.click();
    });
  }

  // ---------------------------------------------------------------------------
  // Copy seller message
  // ---------------------------------------------------------------------------
  copySellerBtn.addEventListener('click', async () => {
    const text = $('seller-message').textContent.trim();
    const ok = await copyToClipboard(text);
    showToast(ok ? 'Message copied' : "Couldn't copy");
  });

  // ---------------------------------------------------------------------------
  // Clipboard helper
  // ---------------------------------------------------------------------------
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (_) {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------
  showView('input');
})();
