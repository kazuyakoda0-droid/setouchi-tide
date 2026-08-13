const tabs = [...document.querySelectorAll('.concept-tab')];
const concepts = [...document.querySelectorAll('[data-concept]')];

function showConcept(key) {
  const safeKey = ['a', 'b', 'c'].includes(key) ? key : 'a';
  concepts.forEach((concept) => {
    concept.classList.toggle('is-active', concept.dataset.concept === safeKey);
  });
  tabs.forEach((tab) => {
    const selected = tab.dataset.target === safeKey;
    tab.classList.toggle('is-active', selected);
    tab.setAttribute('aria-selected', String(selected));
  });
  document.title = `しおどき｜デザイン案 ${safeKey.toUpperCase()}`;
  if (location.hash !== `#${safeKey}`) history.replaceState(null, '', `#${safeKey}`);
  window.scrollTo({ top: 0, behavior: 'instant' });
}

tabs.forEach((tab) => tab.addEventListener('click', () => showConcept(tab.dataset.target)));
window.addEventListener('hashchange', () => showConcept(location.hash.slice(1)));
showConcept(location.hash.slice(1));
