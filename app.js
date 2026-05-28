const CSV_URL = "./data/songs.csv";
const PAGE_SIZE = 40;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const SITE_CREATOR = "Boss";

const state = {
  songs: [],
  filtered: [],
  songGroups: new Map(),
  randomPool: [],
  visibleCount: PAGE_SIZE,
  query: "",
  filter: "all",
  year: "all",
  sort: "relevance",
  dailyPick: null,
};

const elements = {
  searchInput: document.querySelector("#searchInput"),
  clearSearch: document.querySelector("#clearSearch"),
  yearSelect: document.querySelector("#yearSelect"),
  sortSelect: document.querySelector("#sortSelect"),
  chips: [...document.querySelectorAll(".chip")],
  statSongs: document.querySelector("#statSongs"),
  statStreams: document.querySelector("#statStreams"),
  statArtists: document.querySelector("#statArtists"),
  statRange: document.querySelector("#statRange"),
  resultCount: document.querySelector("#resultCount"),
  statusMessage: document.querySelector("#statusMessage"),
  resultsList: document.querySelector("#resultsList"),
  loadMore: document.querySelector("#loadMore"),
  songRanking: document.querySelector("#songRanking"),
  artistCloud: document.querySelector("#artistCloud"),
  dailyThumb: document.querySelector("#dailyThumb"),
  dailyTitle: document.querySelector("#dailyTitle"),
  dailyMeta: document.querySelector("#dailyMeta"),
  dailyOpen: document.querySelector("#dailyOpen"),
  dailyRefresh: document.querySelector("#dailyRefresh"),
  dailyVersions: document.querySelector("#dailyVersions"),
  sourceThanks: document.querySelector("#sourceThanks"),
  dataUpdated: document.querySelector("#dataUpdated"),
  versionsOverlay: document.querySelector("#versionsOverlay"),
  versionsTitle: document.querySelector("#versionsTitle"),
  versionsMeta: document.querySelector("#versionsMeta"),
  versionsList: document.querySelector("#versionsList"),
};

init();

async function init() {
  bindEvents();

  try {
    setStatus("載入歌單資料中");
    const csvText = await fetchCsv();
    const rows = parseCsv(csvText);
    state.songs = rows.map(enrichSong).filter((song) => song.video_id && song.youtube_url);
    state.songGroups = buildSongGroups(state.songs);

    populateYearSelect(state.songs);
    renderStats(state.songs);
    renderSongRanking(state.songs);
    renderArtistCloud(state.songs);
    initRandomPick(state.songs);
    renderDataCredits(state.songs);
    applyFilters();
  } catch (error) {
    console.error(error);
    setStatus("載入失敗，請使用 npm run serve 後開啟本地網址。", true);
  }
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.query = elements.searchInput.value.trim();
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  elements.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && state.filtered[0]) {
      window.open(state.filtered[0].youtube_url, "_blank", "noreferrer");
    }
  });

  elements.clearSearch.addEventListener("click", () => {
    elements.searchInput.value = "";
    state.query = "";
    state.visibleCount = PAGE_SIZE;
    elements.searchInput.focus();
    applyFilters();
  });

  elements.yearSelect.addEventListener("change", () => {
    state.year = elements.yearSelect.value;
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  elements.sortSelect.addEventListener("change", () => {
    state.sort = elements.sortSelect.value;
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  });

  elements.chips.forEach((chip) => {
    chip.addEventListener("click", () => {
      state.filter = chip.dataset.filter || "all";
      state.visibleCount = PAGE_SIZE;
      elements.chips.forEach((button) => button.classList.toggle("is-active", button === chip));
      applyFilters();
    });
  });

  elements.loadMore.addEventListener("click", () => {
    state.visibleCount += PAGE_SIZE;
    renderResults();
  });

  elements.dailyVersions.addEventListener("click", () => {
    if (state.dailyPick) openVersionsForSong(state.dailyPick);
  });

  elements.dailyRefresh.addEventListener("click", () => {
    renderRandomPick({ avoidCurrent: true });
  });

  elements.resultsList.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy-url]");
    if (copyButton) {
      await copyUrl(copyButton);
      return;
    }

    const versionsButton = event.target.closest("[data-version-key]");
    if (versionsButton) {
      const song = state.songs.find((entry) => entry.versionKey === versionsButton.dataset.versionKey);
      if (song) openVersionsForSong(song);
    }
  });

  elements.versionsOverlay.addEventListener("click", async (event) => {
    if (event.target === elements.versionsOverlay || event.target.closest("[data-close-versions]")) {
      closeVersions();
      return;
    }

    const copyButton = event.target.closest("[data-copy-url]");
    if (copyButton) await copyUrl(copyButton);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !elements.versionsOverlay.hidden) {
      closeVersions();
    }
  });
}

async function fetchCsv() {
  const response = await fetch(CSV_URL, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`CSV fetch failed: ${response.status}`);
  }
  return response.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") {
      cell += char;
    }
  }

  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const headers = rows.shift() || [];
  return rows
    .filter((entry) => entry.length > 1)
    .map((entry) => Object.fromEntries(headers.map((header, index) => [header, entry[index] || ""])));
}

function enrichSong(song) {
  const date = song.stream_date ? new Date(`${song.stream_date}T00:00:00`) : null;
  const year = Number(song.stream_date?.slice(0, 4)) || 0;
  const entryType = song.entry_type || (song.category ? "category" : "song");
  const category = normalizeCategory(song.category);
  const canonicalArtist = canonicalizeArtist(song.artist);
  const artistSearchText = artistAliasSearchText(canonicalArtist);
  const sourceAuthor = song.source_comment_author?.trim() || "";
  const normalized = normalizeText([
    song.song_title,
    song.artist,
    canonicalArtist,
    artistSearchText,
    song.video_title,
    song.timestamp,
    song.raw_entry,
  ].join(" "));
  const enriched = {
    ...song,
    date,
    year,
    seconds: Number(song.start_seconds) || 0,
    entryType,
    category,
    canonicalArtist,
    sourceAuthor,
    normalized,
    titleNormalized: normalizeText(song.song_title),
    artistNormalized: normalizeText([song.artist, canonicalArtist, artistSearchText].join(" ")),
    videoNormalized: normalizeText(song.video_title),
    isSleep: /伴睡|睡眠|陪你睡|深夜/i.test(song.video_title),
    isTheme: !/伴睡|睡眠|陪你睡/i.test(song.video_title),
  };

  enriched.groupKey = songGroupKey(enriched);
  enriched.versionKey = `${enriched.video_id}:${enriched.seconds}`;
  return enriched;
}

function normalizeText(text) {
  return String(text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCategory(category) {
  const value = String(category || "").trim();
  if (value === "週表") return "周表";
  if (/^sp$/i.test(value)) return "SP";
  return value;
}

function canonicalizeArtist(artist) {
  const value = String(artist || "").trim();
  if (!value) return "";
  const normalized = normalizeText(value);
  if (normalized === normalizeText("周杰倫 Jay Chou") || normalized === normalizeText("Jay Chou")) {
    return "周杰倫";
  }
  if (normalized === "by2") {
    return "BY2";
  }
  return value;
}

function artistAliasSearchText(canonicalArtist) {
  if (canonicalArtist === "周杰倫") return "周杰倫 Jay Chou";
  return canonicalArtist;
}

function populateYearSelect(songs) {
  const years = [...new Set(songs.map((song) => song.year).filter(Boolean))].sort((a, b) => b - a);
  const options = ['<option value="all">全部年份</option>']
    .concat(years.map((year) => `<option value="${year}">${year}</option>`));
  elements.yearSelect.innerHTML = options.join("");
}

function renderStats(songs) {
  const songEntries = songs.filter((song) => song.entryType === "song");
  const streams = new Set(songs.map((song) => song.video_id));
  const artists = new Set(songEntries.map((song) => song.canonicalArtist).filter(Boolean));
  const dates = songs.map((song) => song.stream_date).filter(Boolean).sort();

  elements.statSongs.textContent = formatNumber(songEntries.length);
  elements.statStreams.textContent = formatNumber(streams.size);
  elements.statArtists.textContent = formatNumber(artists.size);
  elements.statRange.textContent = dates.length ? `${dates[0].slice(0, 4)}-${dates.at(-1).slice(0, 4)}` : "-";
}

function renderArtistCloud(songs) {
  const counts = new Map();
  for (const song of songs) {
    if (song.entryType !== "song") continue;
    const artist = song.canonicalArtist;
    if (!artist) continue;
    counts.set(artist, (counts.get(artist) || 0) + 1);
  }

  const artists = [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"))
    .slice(0, 18);

  elements.artistCloud.innerHTML = artists
    .map(([artist, count]) => (
      `<button type="button" data-artist="${escapeAttribute(artist)}">${escapeHtml(artist)} <span>${count}</span></button>`
    ))
    .join("");

  elements.artistCloud.querySelectorAll("[data-artist]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.searchInput.value = button.dataset.artist || "";
      state.query = elements.searchInput.value;
      state.visibleCount = PAGE_SIZE;
      applyFilters();
      elements.searchInput.focus();
    });
  });
}

function renderSongRanking(songs) {
  const counts = new Map();
  for (const song of songs) {
    if (!isSongCandidate(song)) continue;
    const title = song.song_title.trim();
    if (!title) continue;
    const key = normalizeText(title);
    const current = counts.get(key) || { title, count: 0, latestDate: "", artistCounts: new Map() };
    current.count += 1;
    if (song.stream_date > current.latestDate) current.latestDate = song.stream_date;
    if (song.canonicalArtist) {
      current.artistCounts.set(song.canonicalArtist, (current.artistCounts.get(song.canonicalArtist) || 0) + 1);
    }
    counts.set(key, current);
  }

  const ranked = [...counts.values()]
    .sort((a, b) => b.count - a.count || b.latestDate.localeCompare(a.latestDate) || a.title.localeCompare(b.title, "zh-Hant"))
    .slice(0, 20)
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      topArtist: [...item.artistCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "未標註歌手",
    }));

  elements.songRanking.innerHTML = ranked.map(renderRankedSong).join("");

  elements.songRanking.querySelectorAll("[data-song-query]").forEach((button) => {
    button.addEventListener("click", () => {
      elements.searchInput.value = button.dataset.songQuery || "";
      state.query = elements.searchInput.value;
      state.visibleCount = PAGE_SIZE;
      applyFilters();
      elements.searchInput.focus();
    });
  });
}

function initRandomPick(songs) {
  state.randomPool = songs
    .filter(isSongCandidate)
    .sort((a, b) => a.song_title.localeCompare(b.song_title, "zh-Hant") || a.video_id.localeCompare(b.video_id) || a.seconds - b.seconds);

  renderRandomPick();
}

function renderRandomPick(options = {}) {
  if (!state.randomPool.length) {
    elements.dailyTitle.textContent = "尚無可推薦曲目";
    elements.dailyMeta.textContent = "資料載入完成後會自動顯示隨選曲目。";
    elements.dailyOpen.hidden = true;
    elements.dailyRefresh.hidden = true;
    elements.dailyVersions.hidden = true;
    return;
  }

  const song = pickRandomSong(options.avoidCurrent);
  const versions = getSongVersions(song);
  state.dailyPick = song;

  elements.dailyThumb.style.backgroundImage = `url('${thumbnailUrl(song.video_id, "hqdefault")}')`;
  elements.dailyTitle.textContent = song.song_title;
  elements.dailyMeta.textContent = [
    displayArtist(song),
    song.stream_date,
    song.timestamp,
    `${versions.length} 個版本`,
  ].filter(Boolean).join(" · ");
  elements.dailyOpen.href = song.youtube_url;
  elements.dailyOpen.hidden = false;
  elements.dailyRefresh.hidden = false;
  elements.dailyVersions.hidden = false;
  elements.dailyVersions.textContent = `查看 ${versions.length} 個版本`;
}

function pickRandomSong(avoidCurrent = false) {
  if (state.randomPool.length === 1) return state.randomPool[0];

  let song = state.randomPool[Math.floor(Math.random() * state.randomPool.length)];
  if (!avoidCurrent || !state.dailyPick) return song;

  while (song.versionKey === state.dailyPick.versionKey) {
    song = state.randomPool[Math.floor(Math.random() * state.randomPool.length)];
  }
  return song;
}

function renderDataCredits(songs) {
  const sourceCounts = new Map();
  const scrapedDates = [];

  for (const song of songs) {
    if (song.sourceAuthor) {
      sourceCounts.set(song.sourceAuthor, (sourceCounts.get(song.sourceAuthor) || 0) + 1);
    }
    if (song.scraped_at) {
      const date = new Date(song.scraped_at);
      if (!Number.isNaN(date.getTime())) scrapedDates.push(date);
    }
  }

  const sources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hant"));
  if (!sources.length) {
    elements.sourceThanks.textContent = "資料來源感謝：歌回留言中的時間軸整理者";
  } else {
    const names = sources.slice(0, 3).map(([name]) => name);
    const suffix = sources.length > names.length ? ` 等 ${sources.length} 位` : "";
    elements.sourceThanks.textContent = `資料來源感謝：${names.join("、")}${suffix} 的歌回時間軸留言整理`;
  }

  if (!scrapedDates.length) {
    elements.dataUpdated.textContent = "資料更新：-";
    return;
  }

  const latest = scrapedDates.sort((a, b) => b.getTime() - a.getTime())[0];
  elements.dataUpdated.textContent = `資料更新：${formatDateTime(latest)}`;
}

function buildSongGroups(songs) {
  const groups = new Map();
  for (const song of songs) {
    if (song.entryType !== "song" || !song.groupKey) continue;
    if (!groups.has(song.groupKey)) groups.set(song.groupKey, []);
    groups.get(song.groupKey).push(song);
  }

  for (const versions of groups.values()) {
    versions.sort(compareVersionDesc);
  }
  return groups;
}

function songGroupKey(song) {
  const title = normalizeText(song.song_title);
  if (!title) return "";
  return title;
}

function getSongVersions(song) {
  return state.songGroups.get(song.groupKey) || [song];
}

function isSongCandidate(song) {
  return song.entryType === "song"
    && Boolean(song.song_title.trim())
    && Boolean(song.canonicalArtist)
    && !isLikelyNonSongSegment(song.song_title);
}

function isLikelyNonSongSegment(title) {
  return /周表|週表|^sp$|閒聊|雜談|公告|開場|中場|休息|棉花糖|superchat|shorts|讀留言|回應留言/i.test(String(title || ""));
}

function renderRankedSong(item) {
  return `
    <button class="ranked-song" type="button" data-song-query="${escapeAttribute(item.title)}">
      <span class="rank-number">${item.rank}</span>
      <span class="rank-main">
        <strong>${escapeHtml(item.title)}</strong>
        <small>${escapeHtml(item.topArtist)}</small>
      </span>
      <span class="rank-count">${item.count}</span>
    </button>
  `;
}

function applyFilters() {
  const query = normalizeText(state.query);
  const tokens = query ? query.split(" ").filter(Boolean) : [];
  const now = Date.now();

  let songs = state.songs.filter((song) => {
    if (state.year !== "all" && String(song.year) !== state.year) return false;
    if (state.filter === "sleep" && !song.isSleep) return false;
    if (state.filter === "theme" && !song.isTheme) return false;
    if (state.filter === "schedule" && song.category !== "周表") return false;
    if (state.filter === "sp" && song.category !== "SP") return false;
    if (state.filter === "recent" && (!song.date || now - song.date.getTime() > ONE_YEAR_MS)) return false;
    if (!tokens.length) return true;
    return tokens.every((token) => song.normalized.includes(token));
  });

  songs = songs.map((song) => ({
    ...song,
    relevance: tokens.length ? scoreSong(song, tokens, query) : 0,
  }));

  songs.sort(sortSongs);
  state.filtered = songs;
  renderResults();
}

function scoreSong(song, tokens, query) {
  let score = 0;
  if (song.titleNormalized === query) score += 140;
  if (song.artistNormalized === query) score += 100;
  if (song.titleNormalized.startsWith(query)) score += 70;
  if (song.artistNormalized.startsWith(query)) score += 54;

  for (const token of tokens) {
    if (song.titleNormalized.includes(token)) score += 42;
    if (song.artistNormalized.includes(token)) score += 32;
    if (song.videoNormalized.includes(token)) score += 12;
  }

  score += Math.max(0, song.year - 2020);
  return score;
}

function sortSongs(a, b) {
  if (state.sort === "newest") return compareDateDesc(a, b) || a.seconds - b.seconds;
  if (state.sort === "oldest") return compareDateAsc(a, b) || a.seconds - b.seconds;
  if (state.sort === "song") return a.song_title.localeCompare(b.song_title, "zh-Hant") || compareDateDesc(a, b);
  return b.relevance - a.relevance || compareDateDesc(a, b) || a.seconds - b.seconds;
}

function compareDateDesc(a, b) {
  return (b.date?.getTime() || 0) - (a.date?.getTime() || 0);
}

function compareDateAsc(a, b) {
  return (a.date?.getTime() || 0) - (b.date?.getTime() || 0);
}

function compareVersionDesc(a, b) {
  return compareDateDesc(a, b) || b.seconds - a.seconds;
}

function renderResults() {
  const visible = state.filtered.slice(0, state.visibleCount);
  elements.resultCount.textContent = `${formatNumber(state.filtered.length)} 筆`;
  elements.loadMore.hidden = state.visibleCount >= state.filtered.length;

  if (!state.filtered.length) {
    elements.resultsList.innerHTML = "";
    setStatus("沒有找到符合條件的歌曲。");
    return;
  }

  setStatus("");
  elements.resultsList.innerHTML = visible.map(renderSongRow).join("");
}

function renderSongRow(song, index) {
  const isCategory = song.entryType === "category";
  const artist = isCategory ? `分類：${song.category || "段落"}` : displayArtist(song);
  const videoMeta = [song.stream_date, `第 ${song.song_order} 首`, song.video_title].filter(Boolean).join(" · ");
  const delay = Math.min(index, 10) * 28;
  const versions = isCategory ? [] : getSongVersions(song);

  return `
    <article class="song-row" style="animation-delay:${delay}ms">
      <div class="song-thumb" style="background-image:url('${thumbnailUrl(song.video_id)}')"></div>
      <div class="song-main">
        <div class="song-title-line">
          <span class="timestamp">${escapeHtml(song.timestamp)}</span>
          ${isCategory ? `<span class="category-badge">${escapeHtml(song.category || "分類")}</span>` : ""}
          <h3 title="${escapeAttribute(song.song_title)}">${escapeHtml(song.song_title)}</h3>
        </div>
        <p class="song-artist">${escapeHtml(artist)}</p>
        <p class="song-video">${escapeHtml(videoMeta)}</p>
        ${song.sourceAuthor ? `<p class="song-source">時間軸：${escapeHtml(song.sourceAuthor)}</p>` : ""}
      </div>
      <div class="song-actions">
        <a class="play-link" href="${escapeAttribute(song.youtube_url)}" target="_blank" rel="noreferrer">${isCategory ? "前往" : "播放"}</a>
        ${!isCategory ? `<button class="copy-button version-button" type="button" data-version-key="${escapeAttribute(song.versionKey)}">${versions.length} 版</button>` : ""}
        <button class="copy-button" type="button" data-copy-url="${escapeAttribute(song.youtube_url)}">複製</button>
      </div>
    </article>
  `;
}

function openVersionsForSong(song) {
  const versions = getSongVersions(song);
  const latestDate = versions.map((item) => item.stream_date).filter(Boolean).sort().at(-1) || "-";
  const artists = [...new Set(versions.map(displayArtist).filter(Boolean))].slice(0, 3).join("、");

  elements.versionsTitle.textContent = song.song_title;
  elements.versionsMeta.textContent = [`共 ${versions.length} 次`, `最近 ${latestDate}`, artists].filter(Boolean).join(" · ");
  elements.versionsList.innerHTML = versions.map(renderVersionRow).join("");
  elements.versionsOverlay.hidden = false;
  document.body.classList.add("modal-open");
  elements.versionsOverlay.querySelector("[data-close-versions]").focus();
}

function closeVersions() {
  elements.versionsOverlay.hidden = true;
  document.body.classList.remove("modal-open");
}

function renderVersionRow(song) {
  const source = song.sourceAuthor ? `時間軸：${song.sourceAuthor}` : "時間軸：未標註";
  const meta = [song.stream_date, song.timestamp, displayArtist(song), source].filter(Boolean).join(" · ");

  return `
    <article class="version-row">
      <div class="version-thumb" style="background-image:url('${thumbnailUrl(song.video_id)}')"></div>
      <div class="version-main">
        <p class="version-meta">${escapeHtml(meta)}</p>
        <h3>${escapeHtml(song.video_title)}</h3>
      </div>
      <div class="version-actions">
        <a class="play-link" href="${escapeAttribute(song.youtube_url)}" target="_blank" rel="noreferrer">播放</a>
        <button class="copy-button" type="button" data-copy-url="${escapeAttribute(song.youtube_url)}">複製</button>
      </div>
    </article>
  `;
}

async function copyUrl(button) {
  try {
    await navigator.clipboard.writeText(button.dataset.copyUrl);
    const original = button.textContent;
    button.textContent = "已複製";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1100);
  } catch {
    button.textContent = "複製失敗";
  }
}

function displayArtist(song) {
  return song.canonicalArtist || "未標註歌手";
}

function setStatus(message, isError = false) {
  elements.statusMessage.textContent = message;
  elements.statusMessage.classList.toggle("is-error", isError);
}

function thumbnailUrl(videoId, quality = "mqdefault") {
  return `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/${quality}.jpg`;
}

function formatNumber(value) {
  return new Intl.NumberFormat("zh-Hant-TW").format(value);
}

function formatDateTime(date) {
  return new Intl.DateTimeFormat("zh-Hant-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}
