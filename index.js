$(document).ready(function() {
  // --- Global Variables ---
  let firstCard = null;
  let secondCard = null;
  let lockBoard = false;
  let matchedPairs = 0;
  let totalPairs = 3;
  let clicks = 0;
  let timerId = null;
  let timeLeft = 60;
  let gameStarted = false;
  let currentDifficulty = 'easy';
  let pokemonCardsData = [];

  const difficultySettings = {
      easy: { pairs: 3, time: 90, gridCols: 3, powerUpDelay: 15000 },
      medium: { pairs: 6, time: 180, gridCols: 4, powerUpDelay: 25000 },
      hard: { pairs: 10, time: 240, gridCols: 5, powerUpDelay: 35000 }
  };

  // DOM Elements
  const $gameGrid = $("#game_grid");
  const $clicksCount = $("#clicks_count");
  const $pairsMatchedCount = $("#pairs_matched_count");
  const $pairsLeftCount = $("#pairs_left_count");
  const $totalPairsCount = $("#total_pairs_count");
  const $timerDisplay = $("#timer_display");
  const $startButton = $("#start_button");
  const $resetButton = $("#reset_button");
  const $difficultySelect = $("#difficulty_select");
  const $themeToggle = $("#theme_toggle");
  const $powerUpButton = $("#power_up_button");
  const $messageArea = $("#message_area");
  const $loadingIndicator = $("#loading_indicator");

  let powerUpAvailable = false;
  let powerUpTimeoutId = null;

  // --- Core Game Logic ---
  async function initializeGame() {
      resetGameVariables();
      updateHeaderDisplay();
      $messageArea.text("").removeClass("win-message lose-message");
      $gameGrid.empty().removeClass('disabled-grid');

      const settings = difficultySettings[currentDifficulty];
      totalPairs = settings.pairs;
      timeLeft = settings.time;
      // Dynamically adjust grid layout
      $gameGrid.css('grid-template-columns', `repeat(${settings.gridCols}, 1fr)`);
      updateHeaderDisplay();

      try {
          $loadingIndicator.show();
          const uniquePokemon = await fetchUniquePokemon(totalPairs);
          if (uniquePokemon.length < totalPairs) {
                $messageArea.text(`Warning: Could only load ${uniquePokemon.length} unique Pokémon. Game will proceed with this amount.`);
                totalPairs = uniquePokemon.length;
                if (totalPairs === 0) {
                  $messageArea.text("Error: No Pokémon could be loaded. Please try again later.");
                  $loadingIndicator.hide();
                  enableControls();
                  return;
                }
                updateHeaderDisplay();
          }

          pokemonCardsData = [];
          uniquePokemon.forEach(pokemon => {
              pokemonCardsData.push({ ...pokemon, uniqueId: `${pokemon.id}-${pokemon.name}-a` });
              pokemonCardsData.push({ ...pokemon, uniqueId: `${pokemon.id}-${pokemon.name}-b` });
          });
          shuffleArray(pokemonCardsData);
          createBoard();
          powerUpAvailable = false;
          $powerUpButton.prop("disabled", true).text("Power-Up Soon");
          if(powerUpTimeoutId) clearTimeout(powerUpTimeoutId);
          powerUpTimeoutId = setTimeout(enablePowerUp, settings.powerUpDelay);

      } catch (error) {
          console.error("Failed to initialize game:", error);
          $messageArea.text("Error loading Pokémon data. Please check your connection and try again.");
          enableControls();
      } finally {
          $loadingIndicator.hide();
      }
  }

  function resetGameVariables() {
      firstCard = null;
      secondCard = null;
      lockBoard = false;
      matchedPairs = 0;
      clicks = 0;
      if (timerId) clearInterval(timerId);
      timerId = null;
      if(powerUpTimeoutId) clearTimeout(powerUpTimeoutId);
      powerUpTimeoutId = null;
      gameStarted = false;
  }

  async function fetchUniquePokemon(count) {
      const response = await fetch(`https://pokeapi.co/api/v2/pokemon?limit=1025`);
      if (!response.ok) throw new Error("Failed to fetch Pokémon list from PokeAPI");
      const data = await response.json();
      
      let allPokemon = data.results;
      shuffleArray(allPokemon);

      const selectedPokemonDetails = [];
      const pokemonNames = new Set();

      for (const pokemonListItem of allPokemon) {
          if (selectedPokemonDetails.length >= count) break;
          if (pokemonNames.has(pokemonListItem.name)) continue;

          try {
              const detailResponse = await fetch(pokemonListItem.url);
              if (!detailResponse.ok) continue;
              const detailData = await detailResponse.json();
              const imageUrl = detailData.sprites?.other?.['official-artwork']?.front_default;

              if (imageUrl) {
                  selectedPokemonDetails.push({
                      id: detailData.id,
                      name: detailData.name,
                      imageUrl: imageUrl
                  });
                  pokemonNames.add(detailData.name);
              }
          } catch (error) {
              console.warn(`Skipping ${pokemonListItem.name} due to fetch error:`, error.message);
          }
      }
      return selectedPokemonDetails;
  }

  function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [array[i], array[j]] = [array[j], array[i]];
      }
  }

  function createBoard() {
      $gameGrid.empty();
      pokemonCardsData.forEach(pokemon => {
          const cardHTML = `
              <div class="card" data-id="${pokemon.uniqueId}" data-name="${pokemon.name}">
                  <img class="front_face" src="${pokemon.imageUrl}" alt="${pokemon.name}">
                  <img class="back_face" src="back.webp" alt="Card Back">
              </div>`;
          const $card = $(cardHTML);
          $card.on("click", handleCardClick);
          $gameGrid.append($card);
      });
  }

  function handleCardClick() {
      if (!gameStarted || lockBoard) return;
      const $clickedCard = $(this);

      if ($clickedCard.is(firstCard) || $clickedCard.hasClass("matched") || $clickedCard.hasClass("flip")) {
          return;
      }

      $clickedCard.addClass("flip");
      clicks++;
      updateHeaderDisplay();

      if (!firstCard) {
          firstCard = $clickedCard;
      } else {
          secondCard = $clickedCard;
          lockBoard = true;
          checkForMatch();
      }
  }

  function checkForMatch() {
      const isMatch = firstCard.data("name") === secondCard.data("name");
      if (isMatch) {
          disableCards();
      } else {
          unflipCards();
      }
  }

  function disableCards() {
      firstCard.addClass("matched").off("click");
      secondCard.addClass("matched").off("click");
      matchedPairs++;
      updateHeaderDisplay();
      resetBoardStateAfterCheck();

      if (matchedPairs === totalPairs) {
          winGame();
      }
  }

  function unflipCards() {
      setTimeout(() => {
          if (firstCard) firstCard.removeClass("flip");
          if (secondCard) secondCard.removeClass("flip");
          resetBoardStateAfterCheck();
      }, 1000);
  }

  function resetBoardStateAfterCheck() {
      firstCard = null;
      secondCard = null;
      lockBoard = false;
  }

  // --- Game State & UI ---
  function startGame() {
      if (gameStarted && matchedPairs < totalPairs && timeLeft > 0) return;

      gameStarted = true;
      lockBoard = false;
      disableControlsDuringGame();
      $messageArea.text("Game in progress...");

      initializeGame().then(() => {
          if (totalPairs > 0) {
                startTimer();
          } else {
              gameStarted = false;
              enableControls();
          }
      });
  }

  function startTimer() {
      if (timerId) clearInterval(timerId);
      updateHeaderDisplay();
      timerId = setInterval(() => {
          timeLeft--;
          updateHeaderDisplay();
          if (timeLeft <= 0) {
              gameOver();
          }
      }, 1000);
  }

  function stopTimer() {
      clearInterval(timerId);
      timerId = null;
  }

  function winGame() {
      stopTimer();
      $messageArea.text("Congratulations! You matched all Pokémon! 🎉").addClass("win-message");
      finalizeGameEnd();
  }

  function gameOver() {
      stopTimer();
      $messageArea.text("Game Over! Time ran out. 😞").addClass("lose-message");
      finalizeGameEnd();
  }
  
  function finalizeGameEnd() {
      gameStarted = false;
      lockBoard = true;
      $gameGrid.addClass('disabled-grid');
      enableControls();
      $startButton.text("Play Again?");
      if(powerUpTimeoutId) clearTimeout(powerUpTimeoutId);
      $powerUpButton.prop("disabled", true).text("Power-Up");
  }


  function resetCurrentGame() {
      stopTimer();
      $messageArea.text("Game Reset. Click 'Start Game' to play again.").removeClass("win-message lose-message");
      enableControls();
      $gameGrid.empty().removeClass('disabled-grid');
      resetGameVariables();
      // Reflect current difficulty settings in header before new game starts
      const settings = difficultySettings[currentDifficulty];
      totalPairs = settings.pairs;
      timeLeft = settings.time;
      updateHeaderDisplay();
      $startButton.text("Start Game");
      if(powerUpTimeoutId) clearTimeout(powerUpTimeoutId);
      $powerUpButton.prop("disabled", true).text("Power-Up");
  }

  function updateHeaderDisplay() {
      $clicksCount.text(clicks);
      $pairsMatchedCount.text(matchedPairs);
      const pairsLeft = Math.max(0, totalPairs - matchedPairs);
      $pairsLeftCount.text(pairsLeft);
      $totalPairsCount.text(totalPairs);
      const minutes = Math.floor(Math.max(0, timeLeft) / 60);
      const seconds = Math.max(0, timeLeft) % 60;
      $timerDisplay.text(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
  }

  function disableControlsDuringGame() {
      $startButton.prop("disabled", true);
      $resetButton.prop("disabled", false);
      $difficultySelect.prop("disabled", true);
  }

  function enableControls() {
      $startButton.prop("disabled", false);
      $resetButton.prop("disabled", true);
      $difficultySelect.prop("disabled", false);
  }
  
  function enablePowerUp() {
      if (gameStarted && matchedPairs < totalPairs) {
          powerUpAvailable = true;
          $powerUpButton.prop("disabled", false).text("Reveal Cards!");
      }
  }

  // --- Event Listeners ---
  function setupEventListeners() {
      $startButton.on("click", startGame);
      $resetButton.on("click", resetCurrentGame);

      $difficultySelect.on("change", function() {
          currentDifficulty = $(this).val();
          if (!gameStarted) {
              const settings = difficultySettings[currentDifficulty];
              totalPairs = settings.pairs;
              timeLeft = settings.time;
              updateHeaderDisplay();
              $gameGrid.empty();
              $messageArea.text("Difficulty changed. Click 'Start Game'.");
          }
          // If a game is in progress, changing difficulty doesn't immediately reset.
          // User would need to click reset or start a new game.
      });
      $difficultySelect.val(currentDifficulty);

      $themeToggle.on("click", function() {
          $("body").toggleClass("dark-theme");
          const isDark = $("body").hasClass("dark-theme");
          $(this).text(isDark ? "Light Theme" : "Dark Theme");
          localStorage.setItem("theme", isDark ? "dark" : "light");
      });

      $powerUpButton.on("click", activateRevealPowerUp);

      // Load theme from localStorage
      const savedTheme = localStorage.getItem("theme");
      if (savedTheme === "dark") {
          $("body").addClass("dark-theme");
          $themeToggle.text("Light Theme");
      } else {
          $themeToggle.text("Dark Theme");
      }
      enableControls();
  }

  // --- Power-ups ---
  function activateRevealPowerUp() {
      if (!gameStarted || !powerUpAvailable || lockBoard || matchedPairs === totalPairs) return;

      powerUpAvailable = false;
      $powerUpButton.prop("disabled", true).text("Power-Up Used");
      
      const previousLockState = lockBoard;
      lockBoard = true;

      const $unmatchedCards = $(".card:not(.matched)");
      $unmatchedCards.addClass("flip");

      // Temporarily store current firstCard if one is selected
      const tempFirstCard = firstCard;
      if (firstCard) {
          firstCard.removeClass("flip");
      }


      setTimeout(() => {
          $unmatchedCards.removeClass("flip");
          
          // Restore the firstCard's flipped state if it existed and wasn't matched during the reveal
          if (tempFirstCard && !tempFirstCard.hasClass("matched")) {
              tempFirstCard.addClass("flip");
          }
          // Only unlock if it wasn't locked for other reasons (like two cards already selected)
          if (!secondCard) { 
              lockBoard = previousLockState;
          }
          // If a turn was in progress (firstCard selected), lockBoard remains true until second selection or unflip
      }, 2000);
  }

  // --- Initialization ---
  setupEventListeners();
  // Set initial state based on default difficulty for the header display
  const initialSettings = difficultySettings[currentDifficulty];
  totalPairs = initialSettings.pairs;
  timeLeft = initialSettings.time;
  updateHeaderDisplay();
});