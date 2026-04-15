const MIN_BASE_LENGTH = 3;
const MIN_MIDDLE_LENGTH = 4;
const MIN_FINAL_LENGTH = 5;
const scorePanel = document.getElementById("score-panel");
const currentScoreDisplay = document.getElementById("current-score");
const scoreMessage = document.getElementById("score-message");
const DAILY_SAVES_STORAGE_KEY = "addagrams_daily_saves";
const NON_DAILY_SAVE_STORAGE_KEY = "addagrams_non_daily_save";
const howToPlayModal = document.getElementById("how-to-play-modal");
const howToPlayBtn = document.getElementById("how-to-play-btn");
const closeHowToPlayBtn = document.getElementById("close-how-to-play-btn");

let completionCounter = 0;

function createEmptyRow(letterA, letterB) {
  const rowLetters = {
    letterA: letterA,
    letterB: letterB,
  };

  const playerEntries = {
    baseWord: "",
    middleWord: "",
    finalWord: "",
  };

  const expectedLengths = {
    baseExpectedLength: null,
    middleExpectedLength: null,
    finalExpectedLength: null,
  };

  const rowProgress = {
    lengthAnchorField: null,

    baseState: "empty",
    middleState: "empty",
    finalState: "empty",

    isValid: false,

    baseCompletedAt: null,
    middleCompletedAt: null,
    finalCompletedAt: null,

    baseIsDictionaryValid: null,
    middleIsDictionaryValid: null,
    finalIsDictionaryValid: null,

    baseShouldShake: false,
    middleShouldShake: false,
    finalShouldShake: false,
  };

  return {
    ...rowLetters,
    ...playerEntries,
    ...expectedLengths,
    ...rowProgress,
  };
}

function clearRowShakeFlags(row) {
  row.baseShouldShake = false;
  row.middleShouldShake = false;
  row.finalShouldShake = false;
}

function resetRowDictionaryValidity(row) {
  row.baseIsDictionaryValid = null;
  row.middleIsDictionaryValid = null;
  row.finalIsDictionaryValid = null;

  clearRowShakeFlags(row);
}

function updateRowDictionaryValidity(row) {
  const rowIsStructurallyValid =
    row.baseState === "confirmed" &&
    row.middleState === "confirmed" &&
    row.finalState === "confirmed";

  if (!rowIsStructurallyValid) {
    resetRowDictionaryValidity(row);
    return;
  }

  const previousBaseValidity = row.baseIsDictionaryValid;
  const previousMiddleValidity = row.middleIsDictionaryValid;
  const previousFinalValidity = row.finalIsDictionaryValid;

  row.baseIsDictionaryValid = gameState.validWords.has(
    row.baseWord.toLowerCase(),
  );
  row.middleIsDictionaryValid = gameState.validWords.has(
    row.middleWord.toLowerCase(),
  );
  row.finalIsDictionaryValid = gameState.validWords.has(
    row.finalWord.toLowerCase(),
  );

  row.baseShouldShake =
    previousBaseValidity !== false && row.baseIsDictionaryValid === false;

  row.middleShouldShake =
    previousMiddleValidity !== false && row.middleIsDictionaryValid === false;

  row.finalShouldShake =
    previousFinalValidity !== false && row.finalIsDictionaryValid === false;
}

function applyDictionaryShakeClass(input, shouldShake) {
  input.classList.remove("dictionary-shake");

  if (shouldShake) {
    void input.offsetWidth;
    input.classList.add("dictionary-shake");
  }
}

function fieldHasDictionaryError(row, fieldName) {
  if (fieldName === "baseWord") {
    return row.baseIsDictionaryValid === false;
  }

  if (fieldName === "middleWord") {
    return row.middleIsDictionaryValid === false;
  }

  if (fieldName === "finalWord") {
    return row.finalIsDictionaryValid === false;
  }

  return false;
}

function applyDictionaryTextClass(input, hasDictionaryError) {
  input.classList.remove("dictionary-invalid-text");

  if (hasDictionaryError) {
    input.classList.add("dictionary-invalid-text");
  }
}

function normalizeSecretPhrase(rawPhrase) {
  const trimmedPhrase = rawPhrase.trim();
  const uppercasedPhrase = trimmedPhrase.toUpperCase();
  const lettersOnlyPhrase = uppercasedPhrase.replace(/[^A-Z]/g, "");

  if (lettersOnlyPhrase.length === 0) {
    throw new Error("Secret phrase contains no letters.");
  }

  if (lettersOnlyPhrase.length % 2 !== 0) {
    throw new Error("Secret phrase must contain an even number of letters.");
  }

  if (lettersOnlyPhrase.length < 6) {
    throw new Error("Secret phrase must contain at least 6 letters total.");
  }

  return lettersOnlyPhrase;
}

function buildRowsFromPhrase(secretPhrase) {
  const halfLength = secretPhrase.length / 2;
  const firstWord = secretPhrase.slice(0, halfLength);
  const secondWord = secretPhrase.slice(halfLength);
  const rows = [];

  for (let i = 0; i < halfLength; i++) {
    const letterA = firstWord[i];
    const letterB = secondWord[i];
    const row = createEmptyRow(letterA, letterB);

    rows.push(row);
  }

  return rows;
}

let gameState = {
  hasStarted: false,
  hasWon: false,
  startPhase: "preview",
  visibleRowCount: 1,
  lastDroppedRowIndex: null,
  currentSolvedScore: null,
  mode: "daily",
  pendingPracticePhrase: "",
  showFairnessWarning: false,
  pendingNormalizedPracticePhrase: null,
  secretPhrases: [],
  fairPairs: new Set(),
  validWords: new Set(),
  selectedPhrase: null,
  urlPhrase: null,
  dataReady: false,
  revealedLetterKeys: new Set(),
  spinningLetterKeys: new Set(),

  rows: [],
};

const board = document.getElementById("board");

async function loadTextFileLines(fileName) {
  const response = await fetch(fileName);

  if (!response.ok) {
    throw new Error(`Could not load ${fileName}`);
  }

  const text = await response.text();

  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function getTorontoDateStamp() {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return formatter.format(new Date()); // format: YYYY-MM-DD
}

function getDaysSinceStartInToronto() {
  const todayStamp = getTorontoDateStamp();
  const [year, month, day] = todayStamp.split("-").map(Number);

  const startDate = new Date(Date.UTC(2024, 0, 1));
  const todayDate = new Date(Date.UTC(year, month - 1, day));

  const millisecondsPerDay = 1000 * 60 * 60 * 24;
  return Math.floor((todayDate - startDate) / millisecondsPerDay);
}

function getDailyIndex(listLength) {
  const daysSinceStart = getDaysSinceStartInToronto();
  return (daysSinceStart * 37 + 17) % listLength;
}

function getPairsFromPhrase(secretPhrase) {
  const halfLength = secretPhrase.length / 2;
  const firstWord = secretPhrase.slice(0, halfLength);
  const secondWord = secretPhrase.slice(halfLength);
  const pairs = [];

  for (let i = 0; i < halfLength; i++) {
    pairs.push(firstWord[i] + secondWord[i]);
  }

  return pairs;
}

function phraseIsFair(secretPhrase) {
  const pairs = getPairsFromPhrase(secretPhrase);

  for (const pair of pairs) {
    if (!gameState.fairPairs.has(pair)) {
      return false;
    }
  }

  return true;
}

function selectDailyFairPhrase() {
  const phrases = gameState.secretPhrases;

  if (phrases.length === 0) {
    throw new Error("No secret phrases loaded.");
  }

  const startIndex = getDailyIndex(phrases.length);

  for (let offset = 0; offset < phrases.length; offset++) {
    const index = (startIndex + offset) % phrases.length;
    const candidatePhrase = phrases[index];

    if (phraseIsFair(candidatePhrase)) {
      return candidatePhrase;
    }
  }

  throw new Error("No fair secret phrase found.");
}

function getPhraseFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get("phrase");

  if (!encoded) {
    return null;
  }

  try {
    return atob(encoded);
  } catch (error) {
    console.warn("Failed to decode phrase from URL");
    return null;
  }
}

function choosePuzzlePhrase() {
  const phraseFromUrl = getPhraseFromUrl();

  if (phraseFromUrl) {
    try {
      const normalizedPhrase = normalizeSecretPhrase(phraseFromUrl);

      gameState.puzzleSource = "shared";
      gameState.urlPhrase = normalizedPhrase;

      return normalizedPhrase;
    } catch (error) {
      console.warn(
        "Invalid phrase in URL. Falling back to daily puzzle.",
        error,
      );
    }
  }

  gameState.puzzleSource = "daily";
  gameState.urlPhrase = null;

  return selectDailyFairPhrase();
}

function letterIsRevealed(letterRole, rowIndex) {
  const key = `${letterRole}-${rowIndex}`;
  return gameState.revealedLetterKeys.has(key);
}

function runRevealSequence() {
  gameState.startPhase = "revealing";
  clearSpinningLetterKeys();
  renderBoard();

  const revealOrder = getLetterRevealOrder();
  const staggerDelay = 220;
  const spinDuration = 800;
  const finalRevealPause = 600;

  revealOrder.forEach((key, index) => {
    setTimeout(() => {
      gameState.revealedLetterKeys.add(key);
      gameState.spinningLetterKeys = new Set([key]);
      renderBoard();
      clearSpinningLetterKeys();
    }, index * staggerDelay);
  });

  const totalRevealTime =
    (revealOrder.length - 1) * staggerDelay + spinDuration;

  setTimeout(() => {
    gameState.startPhase = "ready";
    clearSpinningLetterKeys();
    renderBoard();
    renderShareButton();
  }, totalRevealTime + finalRevealPause);
}

function runDropSequence() {
  gameState.startPhase = "dropping";
  gameState.visibleRowCount = 1;
  gameState.lastDroppedRowIndex = null;
  renderBoard();

  const totalRows = gameState.rows.length;
  const normalDropDelay = 300;
  const finalBumpDelay = 500;

  let nextRowToShow = 2;

  function showNextRow() {
    if (nextRowToShow > totalRows) {
      gameState.lastDroppedRowIndex = null;
      runRevealSequence();
      return;
    }

    gameState.visibleRowCount = nextRowToShow;
    gameState.lastDroppedRowIndex = nextRowToShow - 1;
    renderBoard();

    const justAddedFinalRow = nextRowToShow === totalRows;

    nextRowToShow++;

    if (justAddedFinalRow) {
      setTimeout(() => {
        gameState.lastDroppedRowIndex = null;
        runRevealSequence();
      }, finalBumpDelay);
    } else {
      setTimeout(showNextRow, normalDropDelay);
    }
  }

  setTimeout(showNextRow, normalDropDelay);
}

function letterShouldSpin(letterRole, rowIndex) {
  const key = `${letterRole}-${rowIndex}`;
  return gameState.spinningLetterKeys.has(key);
}

function clearSpinningLetterKeys() {
  gameState.spinningLetterKeys = new Set();
}

function renderBoard() {
  board.innerHTML = "";

  let rowsToRender;

  if (gameState.startPhase === "preview") {
    rowsToRender = gameState.rows.slice(0, 1);
  } else {
    rowsToRender = gameState.rows.slice(0, gameState.visibleRowCount);
  }

  rowsToRender.forEach((row, rowIndex) => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "chain-row";
    rowDiv.dataset.row = rowIndex;

    if (row.isValid) {
      rowDiv.classList.add("valid-row");
    }

    if (
      gameState.startPhase === "dropping" &&
      rowIndex === gameState.lastDroppedRowIndex
    ) {
      rowDiv.classList.add("dropping-row");
    }

    if (
      gameState.startPhase === "dropping" &&
      rowIndex === gameState.rows.length - 1 &&
      rowIndex === gameState.lastDroppedRowIndex
    ) {
      rowDiv.classList.add("bottom-bump-row");
    }

    const baseInput = document.createElement("input");
    baseInput.className = "chain-input";
    baseInput.type = "text";
    baseInput.maxLength = 12;
    baseInput.value = row.baseWord;
    baseInput.placeholder = gameState.startPhase === "ready" ? "Word 1" : "";
    baseInput.dataset.row = rowIndex;
    baseInput.dataset.field = "baseWord";
    baseInput.addEventListener("input", handleInput);
    baseInput.disabled = gameState.startPhase !== "ready";

    const letterADiv = document.createElement("div");
    letterADiv.className = "chain-letter";
    letterADiv.dataset.letterRole = "letterA";

    if (letterIsRevealed("A", rowIndex)) {
      letterADiv.classList.add("revealed-letter");
    }

    if (letterShouldSpin("A", rowIndex)) {
      letterADiv.classList.add("spinning-letter");
    }

    letterADiv.textContent = letterIsRevealed("A", rowIndex) ? row.letterA : "";
    applyLetterBoxStateClass(letterADiv, getLetterAStatus(row));

    const middleInput = document.createElement("input");
    middleInput.className = "chain-input";
    middleInput.type = "text";
    middleInput.maxLength = 12;
    middleInput.value = row.middleWord;
    middleInput.placeholder = gameState.startPhase === "ready" ? "Word 2" : "";
    middleInput.dataset.row = rowIndex;
    middleInput.dataset.field = "middleWord";
    middleInput.addEventListener("input", handleInput);
    middleInput.disabled = gameState.startPhase !== "ready";

    const letterBDiv = document.createElement("div");
    letterBDiv.className = "chain-letter";
    letterBDiv.dataset.letterRole = "letterB";

    if (letterIsRevealed("B", rowIndex)) {
      letterBDiv.classList.add("revealed-letter");
    }

    if (letterShouldSpin("B", rowIndex)) {
      letterBDiv.classList.add("spinning-letter");
    }

    letterBDiv.textContent = letterIsRevealed("B", rowIndex) ? row.letterB : "";
    applyLetterBoxStateClass(letterBDiv, getLetterBStatus(row));

    const finalInput = document.createElement("input");
    finalInput.className = "chain-input";
    finalInput.type = "text";
    finalInput.maxLength = 12;
    finalInput.value = row.finalWord;
    finalInput.placeholder = gameState.startPhase === "ready" ? "Word 3" : "";
    finalInput.dataset.row = rowIndex;
    finalInput.dataset.field = "finalWord";
    finalInput.addEventListener("input", handleInput);
    finalInput.disabled = gameState.startPhase !== "ready";

    rowDiv.appendChild(baseInput);
    rowDiv.appendChild(letterADiv);
    rowDiv.appendChild(middleInput);
    rowDiv.appendChild(letterBDiv);
    rowDiv.appendChild(finalInput);

    board.appendChild(rowDiv);
  });
  renderShareButton();
}

function applyFieldStateClass(input, state) {
  input.classList.remove(
    "field-in-progress",
    "field-provisional",
    "field-confirmed",
    "field-error",
  );

  if (state === "in-progress") {
    input.classList.add("field-in-progress");
  }

  if (state === "provisional") {
    input.classList.add("field-provisional");
  }

  if (state === "confirmed") {
    input.classList.add("field-confirmed");
  }

  if (state === "error") {
    input.classList.add("field-error");
  }
}

function applyLetterBoxStateClass(letterBox, state) {
  letterBox.classList.remove(
    "letter-box-yellow",
    "letter-box-green",
    "letter-box-red",
  );

  if (state === "yellow") {
    letterBox.classList.add("letter-box-yellow");
  }

  if (state === "green") {
    letterBox.classList.add("letter-box-green");
  }

  if (state === "red") {
    letterBox.classList.add("letter-box-red");
  }
}

function updateRowUI(rowIndex) {
  const row = gameState.rows[rowIndex];
  const rowDiv = document.querySelector(`.chain-row[data-row="${rowIndex}"]`);

  if (!rowDiv) {
    return;
  }

  const baseInput = rowDiv.querySelector('input[data-field="baseWord"]');
  const middleInput = rowDiv.querySelector('input[data-field="middleWord"]');
  const finalInput = rowDiv.querySelector('input[data-field="finalWord"]');
  const letterABox = rowDiv.querySelector(
    '.chain-letter[data-letter-role="letterA"]',
  );
  const letterBBox = rowDiv.querySelector(
    '.chain-letter[data-letter-role="letterB"]',
  );

  applyFieldStateClass(baseInput, row.baseState);
  applyFieldStateClass(middleInput, row.middleState);
  applyFieldStateClass(finalInput, row.finalState);

  applyDictionaryTextClass(baseInput, fieldHasDictionaryError(row, "baseWord"));
  applyDictionaryTextClass(
    middleInput,
    fieldHasDictionaryError(row, "middleWord"),
  );
  applyDictionaryTextClass(
    finalInput,
    fieldHasDictionaryError(row, "finalWord"),
  );

  applyDictionaryShakeClass(baseInput, row.baseShouldShake);
  applyDictionaryShakeClass(middleInput, row.middleShouldShake);
  applyDictionaryShakeClass(finalInput, row.finalShouldShake);

  const letterAStatus = getLetterAStatus(row);
  const letterBStatus = getLetterBStatus(row);

  applyLetterBoxStateClass(letterABox, letterAStatus);
  applyLetterBoxStateClass(letterBBox, letterBStatus);

  if (row.isValid) {
    rowDiv.classList.add("valid-row");
  } else {
    rowDiv.classList.remove("valid-row");
  }
}

function handleInput(event) {
  const input = event.target;
  const rowIndex = Number(input.dataset.row);
  const fieldName = input.dataset.field;
  const cleanedValue = input.value.toUpperCase().trim();

  gameState.rows[rowIndex][fieldName] = cleanedValue;

  const currentRow = gameState.rows[rowIndex];

  updateExpectedLengths(currentRow);
  updateCompletionTimes(currentRow);
  updateRowStates(currentRow);
  updateRowDictionaryValidity(currentRow);
  updateRowValidation(currentRow);

  updateRowUI(rowIndex);
  clearRowShakeFlags(currentRow);
  updateScoreDisplay();
  saveProgress();
}

function getLetterCounts(word) {
  const counts = {};

  for (const letter of word) {
    if (counts[letter]) {
      counts[letter]++;
    } else {
      counts[letter] = 1;
    }
  }

  return counts;
}

function isValidStep(shorterWord, longerWord, requiredLetter) {
  if (longerWord.length !== shorterWord.length + 1) {
    return false;
  }

  const shorterCounts = getLetterCounts(shorterWord);
  const longerCounts = getLetterCounts(longerWord);

  if (!longerCounts[requiredLetter]) {
    return false;
  }

  longerCounts[requiredLetter]--;

  if (longerCounts[requiredLetter] === 0) {
    delete longerCounts[requiredLetter];
  }

  const shorterLetters = Object.keys(shorterCounts);
  const longerLetters = Object.keys(longerCounts);

  if (shorterLetters.length !== longerLetters.length) {
    return false;
  }

  for (const letter of shorterLetters) {
    if (shorterCounts[letter] !== longerCounts[letter]) {
      return false;
    }
  }

  return true;
}

function isValidDoubleStep(baseWord, finalWord, letterA, letterB) {
  if (finalWord.length !== baseWord.length + 2) {
    return false;
  }

  const baseCounts = getLetterCounts(baseWord);
  const finalCounts = getLetterCounts(finalWord);

  if (letterA === letterB) {
    if (!finalCounts[letterA] || finalCounts[letterA] < 2) {
      return false;
    }
    finalCounts[letterA] -= 2;

    if (finalCounts[letterA] === 0) {
      delete finalCounts[letterA];
    }
  } else {
    if (!finalCounts[letterA] || !finalCounts[letterB]) {
      return false;
    }

    finalCounts[letterA]--;
    finalCounts[letterB]--;

    if (finalCounts[letterA] === 0) {
      delete finalCounts[letterA];
    }

    if (finalCounts[letterB] === 0) {
      delete finalCounts[letterB];
    }
  }

  const baseLetters = Object.keys(baseCounts);
  const finalLetters = Object.keys(finalCounts);

  if (baseLetters.length !== finalLetters.length) {
    return false;
  }

  for (const letter of baseLetters) {
    if (baseCounts[letter] !== finalCounts[letter]) {
      return false;
    }
  }

  return true;
}

function checkRowCompletion(row) {
  if (!row.baseWord || !row.middleWord || !row.finalWord) {
    return false;
  }

  const firstStepIsValid = isValidStep(
    row.baseWord,
    row.middleWord,
    row.letterA,
  );
  const secondStepIsValid = isValidStep(
    row.middleWord,
    row.finalWord,
    row.letterB,
  );

  return firstStepIsValid && secondStepIsValid;
}

function allRowsAreValid() {
  return gameState.rows.every((row) => row.isValid);
}

function getLetterRevealOrder() {
  const revealOrder = [];

  for (let rowIndex = 0; rowIndex < gameState.rows.length; rowIndex++) {
    revealOrder.push(`A-${rowIndex}`);
  }

  for (let rowIndex = 0; rowIndex < gameState.rows.length; rowIndex++) {
    revealOrder.push(`B-${rowIndex}`);
  }

  return revealOrder;
}

function updateRowValidation(row) {
  const rowIsStructurallyValid =
    row.baseState === "confirmed" &&
    row.middleState === "confirmed" &&
    row.finalState === "confirmed";

  const rowIsDictionaryValid =
    row.baseIsDictionaryValid === true &&
    row.middleIsDictionaryValid === true &&
    row.finalIsDictionaryValid === true;

  row.isValid = rowIsStructurallyValid && rowIsDictionaryValid;
}

function updateExpectedLengths(row) {
  row.baseExpectedLength = null;
  row.middleExpectedLength = null;
  row.finalExpectedLength = null;

  if (!row.baseWord && !row.middleWord && !row.finalWord) {
    row.lengthAnchorField = null;
    return;
  }

  if (row.lengthAnchorField && !row[row.lengthAnchorField]) {
    row.lengthAnchorField = null;
  }

  if (!row.lengthAnchorField) {
    if (row.baseWord) {
      row.lengthAnchorField = "baseWord";
    } else if (row.middleWord) {
      row.lengthAnchorField = "middleWord";
    } else if (row.finalWord) {
      row.lengthAnchorField = "finalWord";
    }
  }

  if (row.lengthAnchorField === "baseWord") {
    row.baseExpectedLength = row.baseWord.length;
    row.middleExpectedLength = row.baseWord.length + 1;
    row.finalExpectedLength = row.baseWord.length + 2;
  }

  if (row.lengthAnchorField === "middleWord") {
    row.baseExpectedLength = row.middleWord.length - 1;
    row.middleExpectedLength = row.middleWord.length;
    row.finalExpectedLength = row.middleWord.length + 1;
  }

  if (row.lengthAnchorField === "finalWord") {
    row.baseExpectedLength = row.finalWord.length - 2;
    row.middleExpectedLength = row.finalWord.length - 1;
    row.finalExpectedLength = row.finalWord.length;
  }
}

function getMinimumCandidateLength(fieldName) {
  if (fieldName === "baseWord") {
    return 3;
  }

  if (fieldName === "middleWord") {
    return 4;
  }

  if (fieldName === "finalWord") {
    return 5;
  }

  return null;
}

function fieldsAreCompatible(row, fieldA, fieldB) {
  const wordA = row[fieldA];
  const wordB = row[fieldB];

  if (!wordA || !wordB) {
    return false;
  }

  if (fieldA === "baseWord" && fieldB === "middleWord") {
    return isValidStep(wordA, wordB, row.letterA);
  }

  if (fieldA === "middleWord" && fieldB === "baseWord") {
    return isValidStep(wordB, wordA, row.letterA);
  }

  if (fieldA === "middleWord" && fieldB === "finalWord") {
    return isValidStep(wordA, wordB, row.letterB);
  }

  if (fieldA === "finalWord" && fieldB === "middleWord") {
    return isValidStep(wordB, wordA, row.letterB);
  }

  if (fieldA === "baseWord" && fieldB === "finalWord") {
    return isValidDoubleStep(wordA, wordB, row.letterA, row.letterB);
  }

  if (fieldA === "finalWord" && fieldB === "baseWord") {
    return isValidDoubleStep(wordB, wordA, row.letterA, row.letterB);
  }

  return false;
}

function fieldCanBeTrusted(row, fieldName) {
  const stateKey = fieldName.replace("Word", "State");

  if (
    fieldName === row.lengthAnchorField &&
    isCandidateComplete(row, fieldName)
  ) {
    return true;
  }

  return row[stateKey] === "confirmed";
}

function updateRowStates(row) {
  const fields = ["baseWord", "middleWord", "finalWord"];

  for (const fieldName of fields) {
    const word = row[fieldName];
    const stateKey = fieldName.replace("Word", "State");

    if (!word) {
      row[stateKey] = "empty";
      continue;
    }

    let expectedLength = null;

    if (fieldName === "baseWord") {
      expectedLength = row.baseExpectedLength;
    } else if (fieldName === "middleWord") {
      expectedLength = row.middleExpectedLength;
    } else if (fieldName === "finalWord") {
      expectedLength = row.finalExpectedLength;
    }

    const isAnchor = fieldName === row.lengthAnchorField;
    const minLength = getMinimumCandidateLength(fieldName);

    if (isAnchor) {
      if (word.length < minLength) {
        row[stateKey] = "in-progress";
        continue;
      }
    } else {
      if (expectedLength === null || word.length < expectedLength) {
        row[stateKey] = "in-progress";
        continue;
      }

      if (word.length > expectedLength) {
        row[stateKey] = "error";
        continue;
      }
    }

    row[stateKey] = null;
  }

  for (const fieldName of fields) {
    const stateKey = fieldName.replace("Word", "State");

    if (row[stateKey] !== null) {
      continue;
    }

    if (fieldName === row.lengthAnchorField) {
      row[stateKey] = "provisional";
    }
  }

  for (const fieldName of fields) {
    const stateKey = fieldName.replace("Word", "State");

    if (row[stateKey] !== null) {
      continue;
    }

    let confirmed = false;

    for (const otherField of fields) {
      if (otherField === fieldName) {
        continue;
      }

      const otherStateKey = otherField.replace("Word", "State");
      const otherWord = row[otherField];

      if (!otherWord) {
        continue;
      }

      if (!isCandidateComplete(row, otherField)) {
        continue;
      }

      const otherIsTrusted =
        otherField === row.lengthAnchorField ||
        row[otherStateKey] === "confirmed";

      if (!otherIsTrusted) {
        continue;
      }

      if (fieldsAreCompatible(row, fieldName, otherField)) {
        confirmed = true;
        break;
      }
    }

    if (confirmed) {
      row[stateKey] = "confirmed";
    } else {
      row[stateKey] = "error";
    }
  }

  const anchorField = row.lengthAnchorField;

  if (anchorField) {
    const anchorStateKey = anchorField.replace("Word", "State");

    if (row[anchorStateKey] === "provisional") {
      for (const otherField of fields) {
        if (otherField === anchorField) {
          continue;
        }

        const otherStateKey = otherField.replace("Word", "State");

        if (row[otherStateKey] !== "confirmed") {
          continue;
        }

        if (fieldsAreCompatible(row, anchorField, otherField)) {
          row[anchorStateKey] = "confirmed";
          break;
        }
      }
    }
  }
}

function fieldCountsForLetterCheck(row, fieldName) {
  const word = row[fieldName];

  if (!word) {
    return false;
  }

  let expectedLength = null;

  if (fieldName === "baseWord") {
    expectedLength = row.baseExpectedLength;
  } else if (fieldName === "middleWord") {
    expectedLength = row.middleExpectedLength;
  } else if (fieldName === "finalWord") {
    expectedLength = row.finalExpectedLength;
  }

  const minimumLength = getMinimumCandidateLength(fieldName);

  if (fieldName === row.lengthAnchorField) {
    return word.length >= minimumLength;
  }

  if (expectedLength === null) {
    return false;
  }

  return word.length >= expectedLength;
}

function getLetterAStatus(row) {
  const middleJudgeable = fieldCountsForLetterCheck(row, "middleWord");
  const finalJudgeable = fieldCountsForLetterCheck(row, "finalWord");

  const middleHasA = middleJudgeable && row.middleWord.includes(row.letterA);
  const finalHasA = finalJudgeable && row.finalWord.includes(row.letterA);

  if (middleJudgeable && !middleHasA) {
    return "red";
  }

  if (finalJudgeable && !finalHasA) {
    return "red";
  }

  if (middleJudgeable && finalJudgeable && middleHasA && finalHasA) {
    return "green";
  }

  return "yellow";
}

function getLetterBStatus(row) {
  if (!fieldCountsForLetterCheck(row, "finalWord")) {
    return "yellow";
  }

  if (!row.finalWord.includes(row.letterB)) {
    return "red";
  }

  return "green";
}

function isCandidateComplete(row, fieldName) {
  const word = row[fieldName];

  if (!word) {
    return false;
  }

  const minimumLength = getMinimumCandidateLength(fieldName);

  if (fieldName === row.lengthAnchorField) {
    return word.length >= minimumLength;
  }

  let expectedLength = null;

  if (fieldName === "baseWord") {
    expectedLength = row.baseExpectedLength;
  } else if (fieldName === "middleWord") {
    expectedLength = row.middleExpectedLength;
  } else if (fieldName === "finalWord") {
    expectedLength = row.finalExpectedLength;
  }

  if (expectedLength === null) {
    return false;
  }

  return word.length === expectedLength;
}

function updateCompletionTimes(row) {
  const fields = ["baseWord", "middleWord", "finalWord"];

  for (const fieldName of fields) {
    const completedAtKey = fieldName.replace("Word", "CompletedAt");
    const isNowCandidateComplete = isCandidateComplete(row, fieldName);

    if (isNowCandidateComplete && row[completedAtKey] === null) {
      completionCounter++;
      row[completedAtKey] = completionCounter;
    }

    if (!isNowCandidateComplete) {
      row[completedAtKey] = null;
    }
  }
}

function getValidatedLetterCount() {
  let total = 0;

  gameState.rows.forEach((row) => {
    if (row.isValid) {
      total += row.baseWord.length;
      total += row.middleWord.length;
      total += row.finalWord.length;
    }
  });

  return total;
}

function getRowCount() {
  return gameState.rows.length;
}

function getScoreBand(score, n) {
  if (score === 0) {
    return "Still Getting Started";
  }

  if (score >= 12 && score < 24) {
    return "You Solved A Row!";
  }
  // Minimum solve threshold
  const base = 12 * n;

  if (score < base) {
    return "Making Progress";
  }

  if (score >= base && score < 15 * n && allRowsAreValid()) {
    return "Puzzle Solved — Can You Use More Letters?";
  }

  if (score >= base && score < 15 * n && !allRowsAreValid()) {
    return "On Your Way To Greatness";
  }

  if (score >= 15 * n && score < 18 * n && allRowsAreValid()) {
    return "Wow, Impressive Solve!";
  }

  if (score >= 15 * n && score < 18 * n && !allRowsAreValid()) {
    return "Impressive!";
  }

  if (score >= 18 * n && score < 21 * n && allRowsAreValid()) {
    return "Whoa, Excellent Solve!!";
  }

  if (score >= 18 * n && score < 21 * n && !allRowsAreValid()) {
    return "Excellent!!";
  }

  if (score >= 21 * n && allRowsAreValid()) {
    return "OMG, Masterful Solve!!!";
  }

  return "Masterful!!!";
}

function updateScoreDisplay() {
  const score = getValidatedLetterCount();
  const n = getRowCount();
  const scoreText = getScoreBand(score, n);

  if (score === 0) {
    scorePanel.hidden = true;
    scoreMessage.textContent = "";
    return;
  }

  scorePanel.hidden = false;
  currentScoreDisplay.textContent = score;
  scoreMessage.textContent = scoreText;
}

function showMessage(text) {
  const messageDiv = document.getElementById("message");

  if (!text) {
    messageDiv.style.opacity = 0;
    return;
  }

  messageDiv.textContent = text;
  messageDiv.style.opacity = 1;
}

function initializePuzzle() {
  const normalizedPhrase = normalizeSecretPhrase(gameState.selectedPhrase);
  gameState.rows = buildRowsFromPhrase(normalizedPhrase);
}

async function loadGameData() {
  console.log("loadGameData started");

  const secretPhrases = await loadTextFileLines("secretPhrases.txt");
  const fairPairLines = await loadTextFileLines("fairPairs.txt");
  const validWordLines = await loadTextFileLines("validWordsLower.txt");

  gameState.secretPhrases = secretPhrases;
  gameState.fairPairs = new Set(fairPairLines);
  gameState.validWords = new Set(validWordLines);
  gameState.dataReady = true;

  const initialState = getInitialPuzzleState();

  gameState.selectedPhrase = initialState.selectedPhrase;
  updatePuzzleLabel();
  gameState.mode = initialState.mode;
  gameState.puzzleSource = initialState.puzzleSource;

  console.log("about to launch", {
    selectedPhrase: gameState.selectedPhrase,
    mode: gameState.mode,
    puzzleSource: gameState.puzzleSource,
    savedProgress: initialState.savedProgress,
  });

  launchSelectedPuzzle(initialState.savedProgress);
  renderModePanel();
}

function loadDailySaves() {
  const raw = localStorage.getItem(DAILY_SAVES_STORAGE_KEY);

  if (!raw) {
    return {};
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Daily saves could not be parsed.");
    return {};
  }
}

function loadDailySaveForDate(dateStamp) {
  const dailySaves = loadDailySaves();
  return dailySaves[dateStamp] || null;
}

function saveDailySaves(dailySaves) {
  localStorage.setItem(DAILY_SAVES_STORAGE_KEY, JSON.stringify(dailySaves));
}

function encodePhraseForUrl(phrase) {
  return btoa(phrase);
}

function renderShareButton() {
  const container = document.getElementById("share-container");

  if (gameState.startPhase === "ready") {
    container.hidden = false;
    container.classList.add("visible");
  } else {
    container.classList.remove("visible");
    container.hidden = true;
  }
}

function handleDailyMode() {
  if (!gameState.dataReady) {
    return;
  }

  const todayPhrase = selectTrueDailyPhrase();

  if (
    gameState.puzzleSource === "daily" &&
    gameState.selectedPhrase === todayPhrase
  ) {
    return;
  }

  gameState.mode = "daily";
  gameState.puzzleSource = "daily";
  gameState.urlPhrase = null;
  gameState.selectedPhrase = todayPhrase;
  updatePuzzleLabel();

  renderModePanel();
  launchSelectedPuzzle();
}

const puzzleLabel = document.getElementById("puzzle-label");

function updatePuzzleLabel() {
  if (!gameState.selectedPhrase) {
    puzzleLabel.textContent = "";
    return;
  }

  if (gameState.puzzleSource === "daily") {
    const dateStamp = getTorontoDateStamp();
    const formattedDate = formatDateLong(dateStamp);
    puzzleLabel.textContent = `Daily Puzzle — ${formattedDate}`;
    return;
  }

  if (gameState.puzzleSource === "practice") {
    puzzleLabel.textContent = "Practice Puzzle";
    return;
  }

  if (gameState.puzzleSource === "shared") {
    puzzleLabel.textContent = "Shared Puzzle";
    return;
  }

  puzzleLabel.textContent = "";
}

function getShareStepSquare(stepStatus) {
  if (stepStatus === "green") {
    return "🟩";
  }

  if (stepStatus === "red") {
    return "🟥";
  }

  return "🟨";
}

function buildShareText() {
  const dateStamp = getTorontoDateStamp();
  const formattedDate = formatDateLong(dateStamp);

  let text = `AddaGrams — ${formattedDate}\n\n`;

  const solved = allRowsAreValid();

  text += solved ? "Puzzle solved ✅\n" : "Puzzle in progress\n";

  const totalLetters = gameState.rows.reduce((sum, row) => {
    return (
      sum + row.baseWord.length + row.middleWord.length + row.finalWord.length
    );
  }, 0);

  text += `Letters used: ${totalLetters}\n\n`;

  gameState.rows.forEach((row) => {
    const baseLen = row.baseWord.length || 0;
    const middleLen = row.middleWord.length || 0;
    const finalLen = row.finalWord.length || 0;

    const firstSquare = getShareStepSquare(getLetterAStatus(row));
    const secondSquare = getShareStepSquare(getLetterBStatus(row));

    text += `${baseLen} ${firstSquare} ${middleLen} ${secondSquare} ${finalLen}\n`;
  });

  return text.trim();
}

function selectTrueDailyPhrase() {
  return selectDailyFairPhrase();
}

function launchSelectedPuzzle(savedProgress = null) {
  console.log("launchSelectedPuzzle called", {
    selectedPhrase: gameState.selectedPhrase,
    savedProgress,
  });

  showMessage("");

  gameState.startPhase = "preview";
  gameState.visibleRowCount = 1;
  gameState.lastDroppedRowIndex = null;
  gameState.revealedLetterKeys = new Set();
  gameState.spinningLetterKeys = new Set();
  gameState.currentSolvedScore = null;
  gameState.pendingNormalizedPracticePhrase = null;
  gameState.showFairnessWarning = false;

  initializePuzzle();

  if (
    savedProgress &&
    savedProgress.selectedPhrase === gameState.selectedPhrase
  ) {
    savedProgress.rows.forEach((savedRow, index) => {
      const row = gameState.rows[index];

      if (!row) return;

      row.baseWord = savedRow.baseWord || "";
      row.middleWord = savedRow.middleWord || "";
      row.finalWord = savedRow.finalWord || "";

      updateExpectedLengths(row);
      updateCompletionTimes(row);
      updateRowStates(row);
      updateRowDictionaryValidity(row);
      updateRowValidation(row);
    });

    gameState.startPhase = "ready";
    gameState.visibleRowCount = gameState.rows.length;
    gameState.revealedLetterKeys = new Set(getLetterRevealOrder());

    updateScoreDisplay();
    renderFairnessWarning([]);
    renderBoard();
    return;
  }

  updateScoreDisplay();
  renderFairnessWarning([]);
  renderBoard();
  updatePuzzleLabel();

  const introDelay = 300;

  setTimeout(() => {
    if (gameState.startPhase === "preview") {
      runDropSequence();
    }
  }, introDelay);
}

function formatDateLong(dateStamp) {
  const [year, month, day] = dateStamp.split("-").map(Number);

  const date = new Date(year, month - 1, day);

  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function getSavableGameState() {
  return {
    selectedPhrase: gameState.selectedPhrase,
    mode: gameState.mode,
    puzzleSource: gameState.puzzleSource,
    dailyDate:
      gameState.puzzleSource === "daily" ? getTorontoDateStamp() : null,
    rows: gameState.rows.map((row) => ({
      baseWord: row.baseWord,
      middleWord: row.middleWord,
      finalWord: row.finalWord,
    })),
  };
}

function saveProgress() {
  if (!gameState.selectedPhrase || !gameState.rows.length) {
    return;
  }

  const savableState = getSavableGameState();

  if (gameState.puzzleSource === "daily") {
    const todayStamp = getTorontoDateStamp();
    const dailySaves = loadDailySaves();

    dailySaves[todayStamp] = savableState;
    saveDailySaves(dailySaves);
    return;
  }

  localStorage.setItem(
    NON_DAILY_SAVE_STORAGE_KEY,
    JSON.stringify(savableState),
  );
}

function loadNonDailySave() {
  const raw = localStorage.getItem(NON_DAILY_SAVE_STORAGE_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn("Non-daily save could not be parsed.");
    return null;
  }
}

function clearNonDailySave() {
  localStorage.removeItem(NON_DAILY_SAVE_STORAGE_KEY);
}

function savedProgressIsUsable(saved) {
  if (!saved) {
    return false;
  }

  if (typeof saved.selectedPhrase !== "string" || !saved.selectedPhrase) {
    return false;
  }

  if (!Array.isArray(saved.rows)) {
    return false;
  }

  return true;
}

function getInitialPuzzleState() {
  const phraseFromUrl = getPhraseFromUrl();

  if (phraseFromUrl) {
    try {
      const normalizedPhrase = normalizeSecretPhrase(phraseFromUrl);
      const saved = loadNonDailySave();

      if (
        savedProgressIsUsable(saved) &&
        saved.selectedPhrase === normalizedPhrase
      ) {
        return {
          selectedPhrase: saved.selectedPhrase,
          mode: saved.mode || "daily",
          puzzleSource: "shared",
          savedProgress: saved,
        };
      }

      return {
        selectedPhrase: normalizedPhrase,
        mode: "daily",
        puzzleSource: "shared",
        savedProgress: null,
      };
    } catch (error) {
      console.warn(
        "Invalid phrase in URL. Falling back to saved or daily puzzle.",
        error,
      );
    }
  }

  const todayStamp = getTorontoDateStamp();
  const todayDailyPhrase = selectTrueDailyPhrase();
  const todayDailySave = loadDailySaveForDate(todayStamp);

  if (
    savedProgressIsUsable(todayDailySave) &&
    todayDailySave.selectedPhrase === todayDailyPhrase
  ) {
    return {
      selectedPhrase: todayDailySave.selectedPhrase,
      mode: "daily",
      puzzleSource: "daily",
      savedProgress: todayDailySave,
    };
  }

  const nonDailySave = loadNonDailySave();

  if (
    savedProgressIsUsable(nonDailySave) &&
    nonDailySave.puzzleSource === "practice"
  ) {
    return {
      selectedPhrase: nonDailySave.selectedPhrase,
      mode: nonDailySave.mode || "practice",
      puzzleSource: "practice",
      savedProgress: nonDailySave,
    };
  }

  return {
    selectedPhrase: todayDailyPhrase,
    mode: "daily",
    puzzleSource: "daily",
    savedProgress: null,
  };
}

function handlePracticeMode() {
  gameState.mode = "practice";
  gameState.showFairnessWarning = false;
  gameState.pendingNormalizedPracticePhrase = null;

  renderFairnessWarning([]);
  renderModePanel();
}

function getUnfairPairsFromPhrase(secretPhrase) {
  const pairs = getPairsFromPhrase(secretPhrase);
  return pairs.filter((pair) => !gameState.fairPairs.has(pair));
}

function handleLoadPracticePuzzle() {
  const input = document.getElementById("practice-phrase-input");
  const rawPhrase = input.value;

  try {
    const normalizedPhrase = normalizeSecretPhrase(rawPhrase);
    const unfairPairs = getUnfairPairsFromPhrase(normalizedPhrase);

    if (unfairPairs.length > 0) {
      gameState.pendingNormalizedPracticePhrase = normalizedPhrase;
      gameState.showFairnessWarning = true;
      renderFairnessWarning(unfairPairs);
      return;
    }

    loadPracticePuzzle(normalizedPhrase);
  } catch (error) {
    showMessage(error.message);
  }
}

function loadPracticePuzzle(normalizedPhrase) {
  gameState.selectedPhrase = normalizedPhrase;
  updatePuzzleLabel();
  gameState.puzzleSource = "practice";
  gameState.urlPhrase = null;
  gameState.mode = "practice";

  showMessage("Practice puzzle loaded.");
  renderModePanel();
  clearNonDailySave();
  launchSelectedPuzzle();
}

function renderFairnessWarning(unfairPairs) {
  const warningDiv = document.getElementById("fairness-warning");

  if (!gameState.showFairnessWarning) {
    warningDiv.hidden = true;
    warningDiv.innerHTML = "";
    return;
  }

  warningDiv.hidden = false;

  warningDiv.innerHTML = `
    <div class="submit-box">
      <div class="submit-message">
        In Daily Mode, we usually avoid uncommon letter combinations because they may have few or no reasonable solutions. This phrase includes one or more uncommon pairs. Do you want to continue anyway?
      </div>

<div class="submit-note">
  Uncommon pair(s): ${unfairPairs.join(", ")}
</div>

<div class="warning-spacer"></div>

<div class="submit-buttons">
        <button id="practice-go-back-btn">GO BACK</button>
        <button id="practice-continue-btn">CONTINUE ANYWAY</button>
      </div>
    </div>
  `;

  document
    .getElementById("practice-go-back-btn")
    .addEventListener("click", () => {
      gameState.showFairnessWarning = false;
      renderFairnessWarning([]);
    });

  document
    .getElementById("practice-continue-btn")
    .addEventListener("click", () => {
      if (gameState.pendingNormalizedPracticePhrase) {
        loadPracticePuzzle(gameState.pendingNormalizedPracticePhrase);
      }
    });
}

function renderModePanel() {
  const practicePanel = document.getElementById("practice-panel");
  const input = document.getElementById("practice-phrase-input");
  const dailyBtn = document.getElementById("daily-mode-btn");
  const practiceBtn = document.getElementById("practice-mode-btn");

  if (gameState.mode === "practice") {
    practicePanel.hidden = false;
    practicePanel.classList.add("visible");
    practiceBtn.classList.add("mode-selected");
    dailyBtn.classList.remove("mode-selected");
  } else {
    practicePanel.hidden = true;
    practicePanel.classList.remove("visible");
    dailyBtn.classList.add("mode-selected");
    practiceBtn.classList.remove("mode-selected");
  }

  input.value = gameState.pendingPracticePhrase;

  dailyBtn.disabled =
    gameState.puzzleSource === "daily" &&
    gameState.selectedPhrase === selectTrueDailyPhrase();
  updatePuzzleLabel();
}

function openHowToPlay() {
  howToPlayModal.hidden = false;
}

function closeHowToPlay() {
  howToPlayModal.hidden = true;
}

document
  .getElementById("daily-mode-btn")
  .addEventListener("click", handleDailyMode);
document
  .getElementById("practice-mode-btn")
  .addEventListener("click", handlePracticeMode);
document
  .getElementById("load-practice-btn")
  .addEventListener("click", handleLoadPracticePuzzle);
document
  .getElementById("practice-phrase-input")
  .addEventListener("input", (event) => {
    gameState.pendingPracticePhrase = event.target.value;
  });

const sharePuzzleBtn = document.getElementById("share-puzzle-btn");
const shareResultsBtn = document.getElementById("share-results-btn");

sharePuzzleBtn.addEventListener("click", () => {
  const encodedPhrase = btoa(gameState.selectedPhrase);
  const url = `${window.location.origin}${window.location.pathname}?phrase=${encodedPhrase}`;

  navigator.clipboard
    .writeText(url)
    .then(() => {
      showMessage("Puzzle link copied!");
    })
    .catch(() => {
      showMessage("Could not copy puzzle link.");
    });
});

shareResultsBtn.addEventListener("click", () => {
  const text = buildShareText();

  navigator.clipboard
    .writeText(text)
    .then(() => {
      showMessage("Results copied!");
    })
    .catch(() => {
      showMessage("Could not copy results.");
    });
});

howToPlayBtn.addEventListener("click", openHowToPlay);
closeHowToPlayBtn.addEventListener("click", closeHowToPlay);

howToPlayModal.addEventListener("click", (event) => {
  if (event.target === howToPlayModal) {
    closeHowToPlay();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !howToPlayModal.hidden) {
    closeHowToPlay();
  }
});

loadGameData();
updateScoreDisplay();
