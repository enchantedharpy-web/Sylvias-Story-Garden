const state = {
  stories: [],
  currentStory: null,
  currentChapter: 0,
  view: 'parallel',
  query: '',
};

const els = {
  storyList: document.querySelector('#storyList'),
  chapterList: document.querySelector('#chapterList'),
  passages: document.querySelector('#passages'),
  readerTitle: document.querySelector('#readerTitle'),
  readerMeta: document.querySelector('#readerMeta'),
  readerSummary: document.querySelector('#readerSummary'),
  search: document.querySelector('#storySearch'),
  viewButtons: [...document.querySelectorAll('[data-view]')],
};

async function loadStories() {
  if (window.STORY_LIBRARY?.stories?.length) {
    document.documentElement.dataset.storySource = 'local';
    state.stories = window.STORY_LIBRARY.stories;
    state.currentStory = state.stories[0];
    renderLibrary();
    renderChapterList();
    renderReader();
    return;
  }

  const index = await fetch('stories/index.json').then((response) => response.json());
  const stories = await Promise.all(index.stories.map(async (item) => {
    const full = await fetch(`stories/${item.file}`).then((response) => response.json());
    return { ...item, ...full };
  }));
  document.documentElement.dataset.storySource = 'json';
  state.stories = stories;
  state.currentStory = stories[0];
  renderLibrary();
  renderChapterList();
  renderReader();
}

function renderLibrary() {
  const query = state.query.toLowerCase();
  const stories = state.stories.filter((story) => {
    const haystack = [story.title, story.subtitle, story.summary, ...(story.tags || [])].join(' ').toLowerCase();
    return haystack.includes(query);
  });

  els.storyList.innerHTML = stories.map((story) => `
    <section class="story-card">
      <div>
        <h3>${escapeHtml(story.title)}</h3>
        <p>${escapeHtml(story.summary)}</p>
      </div>
      <div class="tags">${story.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
      <button type="button" data-story="${story.id}">Read story</button>
    </section>
  `).join('');

  els.storyList.querySelectorAll('[data-story]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentStory = state.stories.find((story) => story.id === button.dataset.story);
      state.currentChapter = 0;
      renderChapterList();
      renderReader();
      document.querySelector('#reader').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function renderChapterList() {
  if (!state.currentStory) return;
  els.chapterList.innerHTML = state.currentStory.chapters.map((chapter, index) => `
    <button type="button" class="${index === state.currentChapter ? 'active' : ''}" data-chapter="${index}">${escapeHtml(chapter.title)}</button>
  `).join('');

  els.chapterList.querySelectorAll('[data-chapter]').forEach((button) => {
    button.addEventListener('click', () => {
      state.currentChapter = Number(button.dataset.chapter);
      renderChapterList();
      renderReader();
    });
  });
}

function renderReader() {
  const story = state.currentStory;
  if (!story) return;
  const chapter = story.chapters[state.currentChapter];
  const matches = buildMatches(chapter.passages, state.query);
  els.readerMeta.textContent = `${story.languages.left} + ${story.languages.right} / ${story.chapters.length} chapters`;
  els.readerTitle.textContent = `${story.title}: ${chapter.title}`;
  els.readerSummary.textContent = story.subtitle;
  els.passages.innerHTML = matches.map((passage) => `
    <section class="passage">
      <div class="text-panel left"><strong>${escapeHtml(story.languages.left)}</strong><p>${highlight(passage.da, state.query)}</p></div>
      <div class="text-panel right"><strong>${escapeHtml(story.languages.right)}</strong><p>${highlight(passage.en, state.query)}</p></div>
    </section>
  `).join('') || '<p>No matching passages in this chapter.</p>';
}

function buildMatches(passages, query) {
  const q = query.trim().toLowerCase();
  if (!q) return passages;
  return passages.filter((passage) => `${passage.da} ${passage.en}`.toLowerCase().includes(q));
}

function moveToFirstMatchingChapter() {
  const q = state.query.trim().toLowerCase();
  if (!q || !state.currentStory) return;
  const current = state.currentStory.chapters[state.currentChapter];
  if (buildMatches(current.passages, state.query).length) return;
  const nextIndex = state.currentStory.chapters.findIndex((chapter) => buildMatches(chapter.passages, state.query).length);
  if (nextIndex >= 0) state.currentChapter = nextIndex;
}

function highlight(text, query) {
  const safe = escapeHtml(text);
  const q = query.trim();
  if (!q) return safe;
  const pattern = new RegExp(`(${escapeRegExp(escapeHtml(q))})`, 'ig');
  return safe.replace(pattern, '<mark>$1</mark>');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

els.search.addEventListener('input', (event) => {
  state.query = event.target.value;
  moveToFirstMatchingChapter();
  renderLibrary();
  renderChapterList();
  renderReader();
});

els.viewButtons.forEach((button) => {
  button.addEventListener('click', () => {
    state.view = button.dataset.view;
    document.body.classList.toggle('view-left', state.view === 'left');
    document.body.classList.toggle('view-right', state.view === 'right');
    els.viewButtons.forEach((item) => item.classList.toggle('active', item === button));
  });
});

loadStories().catch((error) => {
  els.readerTitle.textContent = 'The story library could not load';
  els.readerSummary.textContent = 'The story data file is missing or could not be read.';
  console.error(error);
});
