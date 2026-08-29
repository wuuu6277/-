const WRONG_BOOK_KEY = "rd_wrong_book";
const PRACTICE_RECORD_KEY = "rd_practice_records";
const FAVORITE_BOOK_KEY = "rd_favorite_questions";
const MODULE_ALL = "全部题目";
const DIFFICULTY_ALL = "全部难度";
const PRACTICE_SIZES = [10, 20, 50, 100];
const SINGLE_OPTION_IDS = ["A", "B", "C", "D", "E"];
const MASTERY_STREAK_TARGET = 2;

const state = {
  allQuestions: [],
  currentQuestions: [],
  hasSubmitted: false,
  currentModule: MODULE_ALL,
  currentDifficulty: DIFFICULTY_ALL,
  keyPointQuery: "",
  currentSize: 10,
  practiceMode: "normal",
  isReady: false,
  wrongBook: {},
  favoriteBook: new Set(),
  practiceRecords: [],
};

const elements = {
  practiceModeLabel: document.getElementById("practiceModeLabel"),
  currentModuleLabel: document.getElementById("currentModuleLabel"),
  totalQuestionCount: document.getElementById("totalQuestionCount"),
  questionLoaded: document.getElementById("questionLoaded"),
  questionList: document.getElementById("questionList"),
  questionTemplate: document.getElementById("questionTemplate"),
  summaryCard: document.getElementById("summaryCard"),
  summaryTotal: document.getElementById("summaryTotal"),
  summaryCorrect: document.getElementById("summaryCorrect"),
  summaryWrong: document.getElementById("summaryWrong"),
  summaryScore: document.getElementById("summaryScore"),
  wrongIdList: document.getElementById("wrongIdList"),
  distributionText: document.getElementById("distributionText"),
  distributionTip: document.getElementById("distributionTip"),
  submitBtn: document.getElementById("submitBtn"),
  answerProgress: document.getElementById("answerProgress"),
  reloadBtn: document.getElementById("reloadBtn"),
  wrongTrainBtn: document.getElementById("wrongTrainBtn"),
  favoriteTrainBtn: document.getElementById("favoriteTrainBtn"),
  copyWrongBtn: document.getElementById("copyWrongBtn"),
  copyWrongBookBtn: document.getElementById("copyWrongBookBtn"),
  clearWrongBookBtn: document.getElementById("clearWrongBookBtn"),
  statusBanner: document.getElementById("statusBanner"),
  moduleSelect: document.getElementById("moduleSelect"),
  difficultySelect: document.getElementById("difficultySelect"),
  keyPointSearch: document.getElementById("keyPointSearch"),
  sizePicker: document.getElementById("sizePicker"),
  practiceHint: document.getElementById("practiceHint"),
  wrongBookSummary: document.getElementById("wrongBookSummary"),
  wrongBookTableBody: document.getElementById("wrongBookTableBody"),
  recordSummary: document.getElementById("recordSummary"),
  recordTableBody: document.getElementById("recordTableBody"),
  exportDataBtn: document.getElementById("exportDataBtn"),
  importDataBtn: document.getElementById("importDataBtn"),
  importDataInput: document.getElementById("importDataInput"),
};

bindEvents();
init();

function bindEvents() {
  elements.submitBtn.addEventListener("click", handleSubmit);
  elements.reloadBtn.addEventListener("click", () => {
    state.practiceMode = "normal";
    drawQuestions();
  });
  elements.wrongTrainBtn.addEventListener("click", () => {
    state.practiceMode = "wrong-only";
    drawQuestions();
  });
  elements.favoriteTrainBtn.addEventListener("click", () => {
    state.practiceMode = "favorite-only";
    drawQuestions();
  });
  elements.copyWrongBtn.addEventListener("click", () => copyText(elements.wrongIdList.textContent.trim(), "错题号已复制到剪贴板。"));
  elements.copyWrongBookBtn.addEventListener("click", copyWrongBookList);
  elements.clearWrongBookBtn.addEventListener("click", clearWrongBook);
  elements.exportDataBtn.addEventListener("click", exportStudyData);
  elements.importDataBtn.addEventListener("click", () => elements.importDataInput.click());
  elements.importDataInput.addEventListener("change", importStudyData);
  elements.moduleSelect.addEventListener("change", (event) => {
    state.currentModule = event.target.value;
    state.practiceMode = "normal";
    drawQuestions();
  });
  elements.difficultySelect.addEventListener("change", (event) => {
    state.currentDifficulty = event.target.value;
    drawQuestions();
  });
  elements.keyPointSearch.addEventListener("input", debounce((event) => {
    state.keyPointQuery = event.target.value.trim();
    drawQuestions();
  }, 250));

  elements.sizePicker.querySelectorAll("[data-size]").forEach((button) => {
    button.addEventListener("click", () => {
      const nextSize = Number(button.dataset.size);
      if (!PRACTICE_SIZES.includes(nextSize)) {
        return;
      }
      state.currentSize = nextSize;
      elements.sizePicker.querySelectorAll("[data-size]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      drawQuestions(nextSize);
    });
  });
}

async function init() {
  try {
    showStatus("正在读取本地题库...", "info");
    const response = await fetch("./data/questions.json", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`题库读取失败，状态码 ${response.status}`);
    }

    const questions = await response.json();
    validateQuestions(questions);
    state.allQuestions = questions;
    state.isReady = true;
    elements.totalQuestionCount.textContent = `${questions.length} 题`;
    populateDifficultyOptions(questions);
    state.wrongBook = readWrongBook();
    state.favoriteBook = readFavoriteBook();
    state.practiceRecords = readPracticeRecords();
    updatePracticeHint();
    renderWrongBook();
    renderPracticeRecords();
    drawQuestions();
    showStatus(`题库加载完成，共 ${questions.length} 题。你可以先筛模块，再按题量开始练习。`, "info");
  } catch (error) {
    console.error(error);
    showStatus(
      "无法读取 questions.json。请用本地静态服务器打开本项目，例如在项目目录执行 `python3 -m http.server 8080`。",
      "error"
    );
  }
}

function validateQuestions(questions) {
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("题库为空");
  }

  questions.forEach((question) => {
    const requiredFields = [
      "id",
      "module",
      "type",
      "question",
      "options",
      "answer",
      "explanation",
      "keyPoint",
      "difficulty",
    ];

    requiredFields.forEach((field) => {
      if (!(field in question)) {
        throw new Error(`题目 ${question.id || "unknown"} 缺少字段 ${field}`);
      }
    });
  });
}

function drawQuestions(requestedSize) {
  if (!state.isReady || !state.allQuestions.length) {
    showStatus("题库仍在加载，请稍候再选择题量。", "info");
    return;
  }

  syncControlsToState(requestedSize);
  state.hasSubmitted = false;
  hideSummary();
  elements.totalQuestionCount.textContent = `${state.allQuestions.length} 题`;

  const questionPool = getQuestionPool();
  if (!questionPool.length) {
    state.currentQuestions = [];
    elements.questionLoaded.textContent = "0 题";
    elements.practiceModeLabel.textContent = getPracticeModeLabel();
    elements.currentModuleLabel.textContent = getFilterLabel();
    elements.questionList.innerHTML = `
      <section class="card empty-state">
        <h2>当前条件下没有可用题目</h2>
        <p>可以切换模块、调整题量，或者先做题生成错题本/重点题后再专项训练。</p>
      </section>
    `;
    showStatus("当前筛选条件下没有可抽取的题目。", "error");
    return;
  }

  const sampleSize = Math.min(state.currentSize, questionPool.length);
  const sampled = state.practiceMode === "wrong-only"
    ? selectWrongTrainingQuestions(questionPool, sampleSize)
    : shuffleArray([...questionPool]).slice(0, sampleSize);

  state.currentQuestions = sampled.map(prepareQuestion);
  elements.questionLoaded.textContent = `${state.currentQuestions.length} 题`;
  elements.practiceModeLabel.textContent = getPracticeModeLabel();
  elements.currentModuleLabel.textContent = getFilterLabel();
  renderQuestionList();
  updateAnswerProgress();

  const suffix = state.practiceMode === "wrong-only"
    ? "已按错题权重优先抽取。"
    : state.practiceMode === "favorite-only"
      ? "已从重点题中随机抽取。"
      : "已按当前条件随机抽题。";
  showStatus(`筛出 ${questionPool.length} 道题，本次载入 ${state.currentQuestions.length} 题。${suffix}`, "info");
}

function syncControlsToState(requestedSize) {
  state.currentModule = elements.moduleSelect.value || MODULE_ALL;
  state.currentDifficulty = elements.difficultySelect.value || DIFFICULTY_ALL;
  state.keyPointQuery = elements.keyPointSearch.value.trim();
  if (PRACTICE_SIZES.includes(requestedSize)) {
    state.currentSize = requestedSize;
    return;
  }

  const activeSizeButton = elements.sizePicker.querySelector(".segmented-btn.active");
  const activeSize = Number(activeSizeButton?.dataset.size || state.currentSize);
  if (PRACTICE_SIZES.includes(activeSize)) {
    state.currentSize = activeSize;
  }
}

function getQuestionPool() {
  let basePool = state.currentModule === MODULE_ALL
    ? [...state.allQuestions]
    : state.allQuestions.filter((question) => question.module === state.currentModule);

  if (state.currentDifficulty !== DIFFICULTY_ALL) {
    basePool = basePool.filter((question) => question.difficulty === state.currentDifficulty);
  }

  if (state.keyPointQuery) {
    const query = normalizeSearchText(state.keyPointQuery);
    basePool = basePool.filter((question) => {
      const searchableText = normalizeSearchText([
        question.keyPoint,
        question.question,
        question.explanation,
        question.module,
      ].join(" "));
      return searchableText.includes(query);
    });
  }

  if (state.practiceMode === "wrong-only") {
    const wrongIds = new Set(Object.keys(state.wrongBook));
    return basePool.filter((question) => wrongIds.has(question.id));
  }

  if (state.practiceMode === "favorite-only") {
    return basePool.filter((question) => state.favoriteBook.has(question.id));
  }

  return basePool;
}

function selectWrongTrainingQuestions(questionPool, sampleSize) {
  return [...questionPool]
    .sort((left, right) => {
      const rightCount = state.wrongBook[right.id]?.errorCount || 0;
      const leftCount = state.wrongBook[left.id]?.errorCount || 0;
      if (rightCount !== leftCount) {
        return rightCount - leftCount;
      }
      return Math.random() - 0.5;
    })
    .slice(0, sampleSize);
}

function prepareQuestion(question) {
  return {
    ...question,
    shuffledOptions: shuffleArray(question.options.map((option) => ({ ...option }))),
    selected: new Set(),
  };
}

function renderQuestionList() {
  elements.questionList.innerHTML = "";

  state.currentQuestions.forEach((question, index) => {
    const fragment = elements.questionTemplate.content.cloneNode(true);
    const card = fragment.querySelector(".question-card");
    const meta = fragment.querySelector(".question-meta");
    const indexNode = fragment.querySelector(".question-index");
    const title = fragment.querySelector(".question-title");
    const hint = fragment.querySelector(".question-hint");
    const optionList = fragment.querySelector(".option-list");
    const answerPanel = fragment.querySelector(".answer-panel");

    card.classList.add(question.type === "single" ? "question-card-single" : "question-card-multiple");
    card.dataset.questionId = question.id;
    meta.append(
      createBadge(question.type === "single" ? "单选题" : "多选题", `badge-type-${question.type}`),
      createBadge(question.module, "badge-module"),
      createBadge(`考点：${question.keyPoint}`, "badge-keypoint"),
      createBadge(`难度：${question.difficulty}`, "badge-difficulty")
    );
    indexNode.textContent = "";
    indexNode.append(
      document.createTextNode(`第 ${index + 1} 题 / ID: ${question.id}`),
      createFavoriteButton(question.id)
    );
    title.textContent = question.question;
    hint.textContent = question.type === "single"
      ? "单选题：点击一个选项即可完成作答。"
      : "多选题：本题可多选，再次点击已选项可取消。";

    question.shuffledOptions.forEach((option, optionIndex) => {
      const button = document.createElement("button");
      const optionLabel = document.createElement("span");
      const optionText = document.createElement("span");

      button.type = "button";
      button.className = "option-item";
      button.dataset.questionId = question.id;
      button.dataset.optionId = option.id;
      optionLabel.className = "option-label";
      optionLabel.textContent = toAlphabet(optionIndex);
      optionText.className = "option-text";
      optionText.textContent = option.text;
      button.append(optionLabel, optionText);
      button.addEventListener("click", () => handleOptionClick(question.id, option.id));
      optionList.appendChild(button);
    });

    if (state.hasSubmitted) {
      fillAnswerFeedback(question, card, answerPanel);
    }

    elements.questionList.appendChild(fragment);
  });
}

function handleOptionClick(questionId, optionId) {
  if (state.hasSubmitted) {
    return;
  }

  const question = state.currentQuestions.find((item) => item.id === questionId);
  if (!question) {
    return;
  }

  if (question.type === "single") {
    question.selected = new Set([optionId]);
  } else if (question.selected.has(optionId)) {
    question.selected.delete(optionId);
  } else {
    question.selected.add(optionId);
  }

  syncOptionSelection(questionId, question.selected);
  document.querySelector(`[data-question-id="${questionId}"]`)?.closest(".question-card")?.classList.remove("question-unanswered");
  updateAnswerProgress();
}

function syncOptionSelection(questionId, selectedSet) {
  const buttons = document.querySelectorAll(`.option-item[data-question-id="${questionId}"]`);
  buttons.forEach((button) => {
    button.classList.toggle("selected", selectedSet.has(button.dataset.optionId));
  });
}

function handleSubmit() {
  if (!state.currentQuestions.length) {
    return;
  }

  const unansweredQuestions = state.currentQuestions.filter((question) => question.selected.size === 0);
  if (unansweredQuestions.length) {
    markUnansweredQuestions(unansweredQuestions);
    showStatus(`还有 ${unansweredQuestions.length} 道题未作答，已帮你标出。`, "error");
    scrollToQuestion(unansweredQuestions[0].id);
    return;
  }

  state.hasSubmitted = true;

  let correctCount = 0;
  const wrongIds = [];
  const answerResults = [];

  state.currentQuestions.forEach((question) => {
    const isCorrect = isAnswerCorrect(question);
    answerResults.push({ question, isCorrect });
    if (isCorrect) {
      correctCount += 1;
    } else {
      wrongIds.push(question.id);
    }
  });

  const masteryUpdate = persistWrongQuestionResults(answerResults);
  persistPracticeRecord(correctCount, wrongIds);
  state.wrongBook = readWrongBook();
  state.practiceRecords = readPracticeRecords();
  renderWrongBook();
  renderPracticeRecords();
  renderQuestionList();
  renderSummary(correctCount, wrongIds);
  updateAnswerProgress();
  const masteryMessage = masteryUpdate.removedCount
    ? `，${masteryUpdate.removedCount} 道错题已连续答对 ${MASTERY_STREAK_TARGET} 次并移出错题本`
    : "";
  showStatus(`本次提交已完成，答案解析、答案分布与错题本都已更新${masteryMessage}。`, "info");
}

function updateAnswerProgress() {
  if (!elements.answerProgress) {
    return;
  }

  const total = state.currentQuestions.length;
  const answered = state.currentQuestions.filter((question) => question.selected.size > 0).length;
  elements.answerProgress.textContent = `已答 ${answered} / ${total}`;
  elements.answerProgress.classList.toggle("answer-progress-complete", total > 0 && answered === total);
}

function markUnansweredQuestions(unansweredQuestions) {
  const unansweredIds = new Set(unansweredQuestions.map((question) => question.id));
  document.querySelectorAll(".question-card").forEach((card) => {
    const questionId = card.dataset.questionId;
    card.classList.toggle("question-unanswered", unansweredIds.has(questionId));
  });
}

function scrollToQuestion(questionId) {
  const firstOption = document.querySelector(`[data-question-id="${questionId}"]`);
  firstOption?.closest(".question-card")?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function isAnswerCorrect(question) {
  const selected = [...question.selected].sort();
  const answer = [...question.answer].sort();
  if (selected.length !== answer.length) {
    return false;
  }
  return selected.every((item, index) => item === answer[index]);
}

function renderSummary(correctCount, wrongIds) {
  const total = state.currentQuestions.length;
  const wrongCount = total - correctCount;
  const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const distribution = buildDistributionStats();

  elements.summaryTotal.textContent = `${total}`;
  elements.summaryCorrect.textContent = `${correctCount}`;
  elements.summaryWrong.textContent = `${wrongCount}`;
  elements.summaryScore.textContent = `${score} 分`;
  elements.wrongIdList.textContent = wrongIds.length ? wrongIds.join(", ") : "本次全对";
  elements.distributionText.textContent = distribution.text;
  elements.distributionTip.textContent = distribution.tip;
  elements.summaryCard.classList.remove("hidden");
}

function persistPracticeRecord(correctCount, wrongIds) {
  const total = state.currentQuestions.length;
  const wrongCount = total - correctCount;
  const score = total === 0 ? 0 : Math.round((correctCount / total) * 100);
  const records = readPracticeRecords();

  records.unshift({
    submittedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    mode: getRecordModeLabel(),
    module: getFilterLabel(),
    total,
    correctCount,
    wrongCount,
    score,
    wrongIds,
  });

  localStorage.setItem(PRACTICE_RECORD_KEY, JSON.stringify(records.slice(0, 20), null, 2));
}

function getRecordModeLabel() {
  if (state.practiceMode === "wrong-only") {
    return "错题回炉";
  }
  if (state.practiceMode === "favorite-only") {
    return "重点题训练";
  }
  return "正常练习";
}

function buildDistributionStats() {
  const singleQuestions = state.currentQuestions.filter((question) => question.type === "single");
  if (!singleQuestions.length) {
    return {
      text: "本次没有单选题。",
      tip: "答案分布提示仅针对单选题统计。",
    };
  }

  const counts = Object.fromEntries(SINGLE_OPTION_IDS.map((id) => [id, 0]));
  singleQuestions.forEach((question) => {
    const answerId = question.answer[0];
    if (answerId in counts) {
      counts[answerId] += 1;
    }
  });

  const text = SINGLE_OPTION_IDS.map((id) => `${id}: ${counts[id]}`).join(" | ");
  const maxEntry = SINGLE_OPTION_IDS.reduce(
    (current, id) => (counts[id] > current.count ? { id, count: counts[id] } : current),
    { id: "A", count: counts.A }
  );
  const ratio = maxEntry.count / singleQuestions.length;
  const tip = ratio >= 0.6
    ? `提示：本次单选正确答案偏向 ${maxEntry.id}，占比 ${Math.round(ratio * 100)}%，建议后续补题时平衡答案分布。`
    : "提示：本次单选答案分布整体较均衡。";

  return { text, tip };
}

function fillAnswerFeedback(question, card, answerPanel) {
  const correctIds = new Set(question.answer);
  const selected = question.selected;
  const isCorrect = isAnswerCorrect(question);

  card.classList.add(isCorrect ? "question-correct" : "question-incorrect");

  card.querySelectorAll(".option-item").forEach((button) => {
    const optionId = button.dataset.optionId;
    if (correctIds.has(optionId)) {
      button.classList.add("correct");
    }
    if (selected.has(optionId) && !correctIds.has(optionId)) {
      button.classList.add("incorrect");
    }
  });

  answerPanel.classList.remove("hidden");
  answerPanel.classList.add(isCorrect ? "correct-state" : "wrong-state");
  answerPanel.textContent = "";
  answerPanel.append(
    createStrongText(isCorrect ? "回答正确" : "回答错误"),
    createAnswerParagraph("正确答案：", formatAnswerText(question)),
    createAnswerParagraph("解析：", question.explanation)
  );
}

function formatAnswerText(question) {
  return question.answer
    .map((answerId) => {
      const optionIndex = question.shuffledOptions.findIndex((option) => option.id === answerId);
      const option = question.shuffledOptions[optionIndex];
      return option ? `${toAlphabet(optionIndex)}. ${option.text}` : answerId;
    })
    .join("；");
}

function persistWrongQuestionResults(answerResults) {
  const storedWrongBook = readWrongBook();
  const timestamp = new Date().toLocaleString("zh-CN", { hour12: false });
  let removedCount = 0;

  answerResults.forEach(({ question, isCorrect }) => {
    const previous = storedWrongBook[question.id];
    if (!isCorrect) {
      storedWrongBook[question.id] = {
        id: question.id,
        module: question.module,
        keyPoint: question.keyPoint,
        errorCount: previous ? previous.errorCount + 1 : 1,
        correctStreak: 0,
        lastWrongAt: timestamp,
      };
      return;
    }

    if (!previous) {
      return;
    }

    const nextCorrectStreak = (previous.correctStreak || 0) + 1;
    if (nextCorrectStreak >= MASTERY_STREAK_TARGET) {
      delete storedWrongBook[question.id];
      removedCount += 1;
      return;
    }

    storedWrongBook[question.id] = {
      ...previous,
      correctStreak: nextCorrectStreak,
    };
  });

  localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(storedWrongBook, null, 2));
  return { removedCount };
}

function readWrongBook() {
  try {
    return JSON.parse(localStorage.getItem(WRONG_BOOK_KEY) || "{}");
  } catch (error) {
    console.error(error);
    return {};
  }
}

function readPracticeRecords() {
  try {
    const records = JSON.parse(localStorage.getItem(PRACTICE_RECORD_KEY) || "[]");
    return Array.isArray(records) ? records : [];
  } catch (error) {
    console.error(error);
    return [];
  }
}

function readFavoriteBook() {
  try {
    const favoriteIds = JSON.parse(localStorage.getItem(FAVORITE_BOOK_KEY) || "[]");
    return new Set(Array.isArray(favoriteIds) ? favoriteIds : []);
  } catch (error) {
    console.error(error);
    return new Set();
  }
}

function persistFavoriteBook() {
  localStorage.setItem(FAVORITE_BOOK_KEY, JSON.stringify([...state.favoriteBook], null, 2));
  updatePracticeHint();
}

function toggleFavorite(questionId) {
  if (state.favoriteBook.has(questionId)) {
    state.favoriteBook.delete(questionId);
  } else {
    state.favoriteBook.add(questionId);
  }

  persistFavoriteBook();
  syncFavoriteButtons(questionId);
  showStatus(
    state.favoriteBook.has(questionId) ? "已加入重点题。" : "已从重点题移除。",
    "info"
  );
}

function syncFavoriteButtons(questionId) {
  document.querySelectorAll(`.favorite-toggle[data-question-id="${questionId}"]`).forEach((button) => {
    const isFavorite = state.favoriteBook.has(questionId);
    button.classList.toggle("favorite-toggle-active", isFavorite);
    button.setAttribute("aria-pressed", String(isFavorite));
    button.textContent = isFavorite ? "★ 已收藏" : "☆ 收藏";
  });
}

function updatePracticeHint() {
  if (!elements.practiceHint) {
    return;
  }

  const wrongCount = Object.keys(state.wrongBook).length;
  const favoriteCount = state.favoriteBook.size;
  elements.practiceHint.textContent = `单选题点击即选中，多选题支持反复点选/取消。当前错题 ${wrongCount} 道，重点题 ${favoriteCount} 道。`;
}

function formatMasteryProgress(entry) {
  const correctStreak = Math.min(entry.correctStreak || 0, MASTERY_STREAK_TARGET);
  return `${correctStreak}/${MASTERY_STREAK_TARGET}`;
}

function renderWrongBook() {
  const entries = Object.values(state.wrongBook).sort((left, right) => {
    if (right.errorCount !== left.errorCount) {
      return right.errorCount - left.errorCount;
    }
    return String(right.lastWrongAt).localeCompare(String(left.lastWrongAt));
  });

  elements.wrongBookSummary.textContent = entries.length
    ? `当前累计 ${entries.length} 道错题，优先关注高频错题。`
    : "当前错题本为空。";
  updatePracticeHint();

  if (!entries.length) {
    elements.wrongBookTableBody.innerHTML = `
      <tr>
        <td colspan="6" class="empty-cell">当前还没有错题记录。</td>
      </tr>
    `;
    return;
  }

  elements.wrongBookTableBody.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.id)}</td>
          <td>${escapeHtml(entry.module)}</td>
          <td>${escapeHtml(entry.keyPoint)}</td>
          <td>${escapeHtml(entry.errorCount)}</td>
          <td>${escapeHtml(formatMasteryProgress(entry))}</td>
          <td>${escapeHtml(entry.lastWrongAt)}</td>
        </tr>
      `
    )
    .join("");
}

function renderPracticeRecords() {
  const entries = state.practiceRecords.slice(0, 20);
  elements.recordSummary.textContent = entries.length
    ? `最近 ${entries.length} 次做题记录已保存，刷新页面后仍可继续查看。`
    : "当前还没有做题记录。";

  if (!entries.length) {
    elements.recordTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-cell">当前还没有做题记录。</td>
      </tr>
    `;
    return;
  }

  elements.recordTableBody.innerHTML = entries
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.submittedAt)}</td>
          <td>${escapeHtml(entry.mode)}</td>
          <td>${escapeHtml(entry.module)}</td>
          <td>${escapeHtml(entry.total)}</td>
          <td>${escapeHtml(entry.correctCount)}</td>
          <td>${escapeHtml(entry.wrongCount)}</td>
          <td>${escapeHtml(entry.score)} 分</td>
          <td>${escapeHtml(entry.wrongIds.length ? entry.wrongIds.join(", ") : "本次全对")}</td>
        </tr>
      `
    )
    .join("");
}

async function copyWrongBookList() {
  const entries = Object.values(state.wrongBook);
  if (!entries.length) {
    showStatus("当前错题本为空，没有可复制的错题清单。", "info");
    return;
  }

  const text = entries
    .sort((left, right) => right.errorCount - left.errorCount)
    .map((entry) => `${entry.id} | ${entry.module} | ${entry.keyPoint} | 错误次数: ${entry.errorCount} | 掌握进度: ${formatMasteryProgress(entry)} | 最近错误: ${entry.lastWrongAt}`)
    .join("\n");

  await copyText(text, "错题清单已复制到剪贴板。");
}

function exportStudyData() {
  const payload = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    app: "RD题库练习系统",
    wrongBook: readWrongBook(),
    favoriteQuestionIds: [...state.favoriteBook],
    practiceRecords: readPracticeRecords(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const datePart = new Date().toISOString().slice(0, 10).replaceAll("-", "");

  link.href = url;
  link.download = `rd-study-backup-${datePart}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showStatus("学习数据已导出。建议保存到 iCloud、微信文件或网盘。", "info");
}

async function importStudyData(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) {
    return;
  }

  try {
    const payload = JSON.parse(await file.text());
    const normalized = normalizeImportedStudyData(payload);
    const message = `将导入 ${Object.keys(normalized.wrongBook).length} 道错题、${normalized.favoriteQuestionIds.length} 道重点题、${normalized.practiceRecords.length} 条记录，并覆盖本机当前学习数据。确认继续？`;
    if (!window.confirm(message)) {
      return;
    }

    localStorage.setItem(WRONG_BOOK_KEY, JSON.stringify(normalized.wrongBook, null, 2));
    localStorage.setItem(FAVORITE_BOOK_KEY, JSON.stringify(normalized.favoriteQuestionIds, null, 2));
    localStorage.setItem(PRACTICE_RECORD_KEY, JSON.stringify(normalized.practiceRecords.slice(0, 20), null, 2));
    state.wrongBook = readWrongBook();
    state.favoriteBook = readFavoriteBook();
    state.practiceRecords = readPracticeRecords();
    renderWrongBook();
    renderPracticeRecords();
    renderQuestionList();
    updatePracticeHint();
    showStatus("学习数据已导入，本机错题、重点题和学习记录已更新。", "info");
  } catch (error) {
    console.error(error);
    showStatus("导入失败：请选择此前从本工具导出的 JSON 备份文件。", "error");
  }
}

function normalizeImportedStudyData(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("导入文件格式不正确");
  }

  const wrongBook = payload.wrongBook && typeof payload.wrongBook === "object" && !Array.isArray(payload.wrongBook)
    ? payload.wrongBook
    : {};
  const favoriteQuestionIds = Array.isArray(payload.favoriteQuestionIds)
    ? [...new Set(payload.favoriteQuestionIds.map((id) => String(id)).filter(Boolean))]
    : [];
  const practiceRecords = Array.isArray(payload.practiceRecords) ? payload.practiceRecords : [];

  return {
    wrongBook: normalizeWrongBook(wrongBook),
    favoriteQuestionIds,
    practiceRecords: practiceRecords.slice(0, 20),
  };
}

function normalizeWrongBook(wrongBook) {
  return Object.fromEntries(
    Object.entries(wrongBook)
      .filter(([id, entry]) => id && entry && typeof entry === "object")
      .map(([id, entry]) => [
        String(id),
        {
          id: String(entry.id || id),
          module: String(entry.module || ""),
          keyPoint: String(entry.keyPoint || ""),
          errorCount: Math.max(1, Number(entry.errorCount || 1)),
          correctStreak: Math.max(0, Math.min(Number(entry.correctStreak || 0), MASTERY_STREAK_TARGET)),
          lastWrongAt: String(entry.lastWrongAt || ""),
        },
      ])
  );
}

function clearWrongBook() {
  const entries = Object.keys(state.wrongBook);
  if (entries.length && !window.confirm(`确认清空 ${entries.length} 道错题记录？此操作只清空本机浏览器里的错题本。`)) {
    return;
  }

  localStorage.removeItem(WRONG_BOOK_KEY);
  state.wrongBook = {};
  renderWrongBook();
  updatePracticeHint();
  showStatus("错题本已清空。", "info");
}

async function copyText(text, successMessage) {
  const safeText = text.trim();
  if (!safeText || safeText === "暂无" || safeText === "本次全对") {
    showStatus("当前没有可复制的内容。", "info");
    return;
  }

  try {
    await navigator.clipboard.writeText(safeText);
    showStatus(successMessage, "info");
  } catch (error) {
    console.error(error);
    showStatus("复制失败，请检查浏览器是否允许剪贴板权限。", "error");
  }
}

function showStatus(message, type) {
  elements.statusBanner.textContent = message;
  elements.statusBanner.className = `status-banner ${type}`;
}

function hideSummary() {
  document.querySelectorAll(".question-unanswered").forEach((card) => {
    card.classList.remove("question-unanswered");
  });
  elements.summaryCard.classList.add("hidden");
  elements.wrongIdList.textContent = "暂无";
  elements.distributionText.textContent = "暂无";
  elements.distributionTip.textContent = "提交后显示本次答案分布提示。";
}

function getPracticeModeLabel() {
  if (state.practiceMode === "wrong-only") {
    return state.currentModule === MODULE_ALL ? "错题回炉" : `${state.currentModule}错题回炉`;
  }
  if (state.practiceMode === "favorite-only") {
    return state.currentModule === MODULE_ALL ? "重点题训练" : `${state.currentModule}重点题`;
  }
  return state.currentModule;
}

function getFilterLabel() {
  const labels = [state.currentModule];
  if (state.currentDifficulty !== DIFFICULTY_ALL) {
    labels.push(state.currentDifficulty);
  }
  if (state.keyPointQuery) {
    labels.push(`关键词：${state.keyPointQuery}`);
  }
  return labels.join(" / ");
}

function populateDifficultyOptions(questions) {
  const difficulties = [...new Set(questions.map((question) => question.difficulty).filter(Boolean))].sort((left, right) => {
    const order = ["基础", "中等", "提高"];
    const leftIndex = order.indexOf(left);
    const rightIndex = order.indexOf(right);
    if (leftIndex !== -1 || rightIndex !== -1) {
      return (leftIndex === -1 ? order.length : leftIndex) - (rightIndex === -1 ? order.length : rightIndex);
    }
    return left.localeCompare(right, "zh-CN");
  });

  elements.difficultySelect.innerHTML = [
    `<option value="${DIFFICULTY_ALL}">${DIFFICULTY_ALL}</option>`,
    ...difficulties.map((difficulty) => `<option value="${escapeHtml(difficulty)}">${escapeHtml(difficulty)}</option>`),
  ].join("");
}

function normalizeSearchText(text) {
  return String(text || "").trim().toLowerCase();
}

function debounce(callback, delay) {
  let timerId;
  return (...args) => {
    window.clearTimeout(timerId);
    timerId = window.setTimeout(() => callback(...args), delay);
  };
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className}`;
  badge.textContent = text;
  return badge;
}

function createFavoriteButton(questionId) {
  const button = document.createElement("button");
  const isFavorite = state.favoriteBook.has(questionId);
  button.type = "button";
  button.className = `favorite-toggle${isFavorite ? " favorite-toggle-active" : ""}`;
  button.dataset.questionId = questionId;
  button.setAttribute("aria-pressed", String(isFavorite));
  button.textContent = isFavorite ? "★ 已收藏" : "☆ 收藏";
  button.addEventListener("click", () => toggleFavorite(questionId));
  return button;
}

function createStrongText(text) {
  const strong = document.createElement("strong");
  strong.textContent = text;
  return strong;
}

function createAnswerParagraph(label, value) {
  const paragraph = document.createElement("p");
  const strong = document.createElement("strong");
  strong.textContent = label;
  paragraph.append(strong, document.createTextNode(value));
  return paragraph;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toAlphabet(index) {
  return String.fromCharCode(65 + index);
}

function shuffleArray(array) {
  const copy = [...array];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}
