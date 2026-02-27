// ═══════════════════════════════════════════════════════════════
//  MTG SKILL TREE — CARDS.json rendered via skill-tree-engine
//
//  Flat layout: Center (⚔️) → Deck hub → Card nodes
//  Node size:   CMC (converted mana cost)
//  Filters:     Card type (Creature/Instant/…) + Mana color
//  Click:       Tooltip with card art + details
//
//  Depends on: skill-tree-engine.js, viz.js, modals.js
// ═══════════════════════════════════════════════════════════════
(() => {
  const modal    = document.getElementById("mtg-tree-modal");
  const closeBtn = document.getElementById("mtgTreeModalClose");
  if (!modal || !closeBtn) return;

  /* ── MTG color identity → RGB ──────────────────────────── */
  const MTG_COLORS = {
    White: { rgb: "240,220,160" },
    Black: { rgb: "130,110,170" },
    Red:   { rgb: "210,80,60"   },
  };

  /* ── Deck config ───────────────────────────────────────── */
  const DECK_CFG = {
    "the-nobles": { color: "190,40,40",  label: "The Nobles", emoji: "🧛", baseAngle: -Math.PI/2 - 0.35 },
    "the-demons": { color: "90,80,140",  label: "The Demons", emoji: "😈", baseAngle: -Math.PI/2 + 0.35 },
  };

  /* ── Card type config ──────────────────────────────────── */
  const TYPE_ICONS  = { Planeswalker:"🌟", Creature:"🧛", Artifact:"⚙️", Enchantment:"✨", Instant:"⚡", Sorcery:"🔮", Land:"🏔️", Token:"🪙" };
  const TYPE_COLORS = { Planeswalker:"200,170,50", Creature:"100,180,100", Artifact:"160,160,180", Enchantment:"180,130,220", Instant:"80,160,220", Sorcery:"200,100,100", Land:"140,120,90", Token:"180,160,120" };

  /* ── Filter values ─────────────────────────────────────── */
  const allTypes  = ["Creature","Artifact","Enchantment","Instant","Sorcery","Land","Planeswalker"];
  const allColors = ["White","Black","Red","Colorless"];

  /* ── Helpers ───────────────────────────────────────────── */
  function cardColorKeys(card) {
    const c = card.color;
    if (!c || c === "") return ["Colorless"];
    if (Array.isArray(c)) return c.length ? c : ["Colorless"];
    return [c];
  }

  function cardTypeColor(card) {
    const t = Array.isArray(card.types) ? card.types[0] : (card.types || "");
    return TYPE_COLORS[t] || "160,160,170";
  }

  function cardManaRGB(card) {
    const keys = cardColorKeys(card).filter(k => MTG_COLORS[k]);
    if (!keys.length) return "160,160,170";
    const rgbs = keys.map(k => MTG_COLORS[k].rgb.split(",").map(Number));
    const avg = [0,0,0];
    rgbs.forEach(c => { avg[0]+=c[0]; avg[1]+=c[1]; avg[2]+=c[2]; });
    return avg.map(v => Math.round(v/rgbs.length)).join(",");
  }

  /* ── CMC → size mapping ────────────────────────────────── */
  const MIN_SIZE = 34, MAX_SIZE = 80, MAX_CMC = 9;
  function cmcToSize(cmc) {
    const c = Math.min(cmc || 0, MAX_CMC);
    return MIN_SIZE + Math.sqrt(c / MAX_CMC) * (MAX_SIZE - MIN_SIZE);
  }

  /* ── Tooltip state ─────────────────────────────────────── */
  let _tooltip  = null;
  let _tipWorld = null;

  function openCardTooltip(card, nodeEl, graphWorld) {
    closeCardTooltip();
    _tipWorld = graphWorld;

    const tip = document.createElement("div");
    tip.className = "mtg-card-tooltip";

    const artSrc = card.art || "";
    const artImg = artSrc ? '<img src="' + artSrc + '" alt="' + card.cardName + '" class="mtg-tooltip-art">' : "";
    const types  = Array.isArray(card.types) ? card.types.join(", ") : (card.types || "");
    const icon   = TYPE_ICONS[Array.isArray(card.types) ? card.types[0] : card.types] || "";
    const colors = cardColorKeys(card).join("/") || "Colorless";

    tip.innerHTML =
      '<div class="mtg-tooltip-header">' +
        '<strong>' + card.cardName + '</strong>' +
        '<span class="mtg-tooltip-close">&times;</span>' +
      '</div>' + artImg +
      '<div class="mtg-tooltip-body">' +
        '<div class="mtg-tooltip-row">' + icon + ' ' + types + ' · CMC ' + (card.cmc != null ? card.cmc : '?') + '</div>' +
        '<div class="mtg-tooltip-row">' + colors + ' · ' + (card.rarity||'') + ' · ' + (card.category||'') + '</div>' +
        '<div class="mtg-tooltip-row">💰 $' + (card.price||0).toFixed(2) + ' · 🧂 ' + (card.salt||0).toFixed(2) + '</div>' +
        '<div class="mtg-tooltip-text">' + (card.cardText||'') + '</div>' +
      '</div>';

    tip.querySelector(".mtg-tooltip-close").addEventListener("click", closeCardTooltip);
    tip.addEventListener("click", e => e.stopPropagation());

    graphWorld.appendChild(tip);
    const x = parseFloat(nodeEl.style.left) || 0;
    const y = parseFloat(nodeEl.style.top)  || 0;
    tip.style.left = (x + 50) + "px";
    tip.style.top  = (y - 30) + "px";
    _tooltip = tip;
    requestAnimationFrame(() => tip.classList.add("mtg-tooltip-show"));
  }

  function closeCardTooltip() {
    if (_tooltip) { _tooltip.remove(); _tooltip = null; }
  }

  modal.addEventListener("click", e => {
    if (!e.target.closest(".mtg-card-tooltip") && !e.target.closest(".kg-node")) closeCardTooltip();
  });

  /* ── Layout constants ──────────────────────────────────── */
  const DECK_DIST  = 110;
  const CARD_MIN_R = 130;
  const CARD_MAX_R = 450;
  const FAN_ANGLE  = Math.PI * 0.80;
  const CENTER_SIZE = 80;

  /* ── Fetch data once, then build ───────────────────────── */
  let _cardsData = null;

  function ensureData(cb) {
    if (_cardsData) { cb(_cardsData); return; }
    fetch("CARDS.json?v=" + Date.now())
      .then(r => r.json())
      .then(data => { _cardsData = data; cb(data); })
      .catch(err => console.error("MTG Tree: failed to load CARDS.json", err));
  }

  /* ── Create the tree via engine ────────────────────────── */
  const tree = createSkillTree({
    modal:    modal,
    closeBtn: closeBtn,
    edgeSvgSelector: ".mtg-edges",
    centerEmoji: "⚔️",
    centerSize:  CENTER_SIZE,
    minScale: 0.3,
    maxScale: 5,
    initialScale: 1.0,

    filterAxes: [
      {
        key: "type",
        allValues: allTypes,
        allBtn:   modal.querySelector('.mtg-filter[data-type="all"]'),
        itemBtns: modal.querySelectorAll('.mtg-filter[data-type]:not([data-type="all"])'),
      },
      {
        key: "color",
        allValues: allColors,
        allBtn:   modal.querySelector('.mtg-filter[data-color="all"]'),
        itemBtns: modal.querySelectorAll('.mtg-filter[data-color]:not([data-color="all"])'),
      },
    ],

    isNodeVisible: (node, filterSets) => {
      // Type axis
      const activeTypes = filterSets.type;
      const nodeTypes = node.filterKeys.type;
      const typeOk = [...nodeTypes].some(t => activeTypes.has(t));
      // Color axis
      const activeColors = filterSets.color;
      const nodeColors = node.filterKeys.color;
      const colorOk = [...nodeColors].some(c => activeColors.has(c));
      return typeOk && colorOk;
    },

    onClose: closeCardTooltip,

    buildNodes: (graphWorld, svgNS, ctx) => {
      const nodes = [], hubs = [], threads = [];
      const data = _cardsData;
      if (!data || !data.sections) return { nodes, hubs, threads, centerVirts: [] };

      // ── Center node ──────────────────────────────────────
      const centerEl = document.createElement("div");
      centerEl.className = "kg-node kg-node-center mtg-center";
      centerEl.style.setProperty("--kg-size", CENTER_SIZE + "px");
      centerEl.innerHTML = '<div class="kg-node-icon">⚔️</div>';
      centerEl.style.left = "0px";
      centerEl.style.top  = "0px";
      graphWorld.appendChild(centerEl);
      const centerVirt = { targetX: 0, targetY: 0, r: CENTER_SIZE/2, _hidden: false, el: centerEl };

      // ── Per-deck ─────────────────────────────────────────
      data.sections.forEach(section => {
        const deckId  = section.id;
        const deckCfg = DECK_CFG[deckId];
        if (!deckCfg) return;

        const baseAngle = deckCfg.baseAngle;
        const deckX = Math.cos(baseAngle) * DECK_DIST;
        const deckY = Math.sin(baseAngle) * DECK_DIST;

        // Deck hub
        const DECK_SIZE = 60;
        const deckEl = document.createElement("div");
        deckEl.className = "kg-node mtg-deck-hub";
        deckEl.style.setProperty("--tc", deckCfg.color);
        deckEl.style.setProperty("--kg-size", DECK_SIZE + "px");
        deckEl.style.left = deckX + "px";
        deckEl.style.top  = deckY + "px";
        deckEl.innerHTML =
          '<div class="kg-node-accent" style="background:radial-gradient(circle at 30% 30%,rgba(' + deckCfg.color + ',0.22) 0%,transparent 70%);"></div>' +
          '<div class="kg-node-name"><span class="kg-name-layer kg-name-show" style="font-size:10px;">' +
            deckCfg.emoji + '<br>' + deckCfg.label.replace(' ', '<br>') +
          '</span></div>';
        graphWorld.appendChild(deckEl);

        const deckNode = { el: deckEl, deck: deckId, targetX: deckX, targetY: deckY, r: DECK_SIZE/2, _hidden: false, children: [] };
        ctx.registerHover(deckEl, deckNode);
        hubs.push(deckNode);

        // Edge: center → deck
        ctx.addEdge(centerVirt, deckNode, deckCfg.color, 1.5);

        // Sort cards by CMC then price
        const cards = [...(section.items || [])];
        cards.sort((a, b) => (a.cmc||0) - (b.cmc||0) || (b.price||0) - (a.price||0));

        // Fan cards
        cards.forEach((card, idx) => {
          const frac = cards.length === 1 ? 0.5 : idx / (cards.length - 1);
          const angle = baseAngle + FAN_ANGLE * (frac - 0.5);

          const cmcFrac = Math.min((card.cmc||0) / MAX_CMC, 1);
          const dist = CARD_MIN_R + cmcFrac * (CARD_MAX_R - CARD_MIN_R);

          // Deterministic jitter
          const jS1 = Math.sin(idx * 7.3 + baseAngle * 13.7);
          const jS2 = Math.sin(idx * 11.1 + baseAngle * 5.3);
          const jDist  = dist + jS1 * 18;
          const jAngle = angle + jS2 * 0.04;

          const cx = Math.cos(jAngle) * jDist;
          const cy = Math.sin(jAngle) * jDist;
          const size = cmcToSize(card.cmc);
          const typeClr = cardTypeColor(card);
          const manaClr = cardManaRGB(card);

          // Build node
          const el = document.createElement("div");
          el.className = "kg-node mtg-card-node";
          el.style.setProperty("--tc", typeClr);
          el.style.setProperty("--mtg-mana", manaClr);
          el.style.setProperty("--kg-size", size + "px");
          el.style.left = cx + "px";
          el.style.top  = cy + "px";

          let displayName = card.cardName;
          if (displayName.length > 22) displayName = displayName.replace(/,.*$/, "");
          displayName = displayName.replace(/\s+/g, "<br>");

          const typeIcon = TYPE_ICONS[Array.isArray(card.types) ? card.types[0] : card.types] || "";
          const rarityDot = card.rarity === "mythic" ? " 🟠" : card.rarity === "rare" ? " 🟡" : "";
          const cmcLabel = card.cmc != null ? card.cmc : "?";

          el.innerHTML =
            '<div class="kg-node-accent" style="background:radial-gradient(circle at 30% 30%,rgba(' + manaClr + ',0.18) 0%,transparent 70%);"></div>' +
            '<div class="kg-node-name">' +
              '<span class="kg-name-layer kg-name-show">' + displayName + '</span>' +
              '<span class="kg-name-layer kg-name-whisper">' + typeIcon + ' ' + cmcLabel + rarityDot + '</span>' +
            '</div>';

          const fontScale = Math.max(0.7, size / 65);
          el.style.setProperty("--kg-font", Math.round(8 * fontScale) + "px");

          el.addEventListener("click", e => { e.stopPropagation(); openCardTooltip(card, el, graphWorld); });

          graphWorld.appendChild(el);

          const cardNode = {
            el,
            deck: deckId,
            card: card,
            targetX: cx,
            targetY: cy,
            r: size / 2,
            _hidden: false,
            filterKeys: {
              type:  new Set(Array.isArray(card.types) ? card.types : [card.types || ""]),
              color: new Set(cardColorKeys(card)),
            },
          };

          ctx.registerHover(el, cardNode);
          deckNode.children.push(cardNode);
          nodes.push(cardNode);

          // Edge: deck → card
          ctx.addEdge(deckNode, cardNode, typeClr, 0.6);
        });
      });

      return { nodes, hubs, threads, centerVirts: [centerVirt] };
    },
  });

  /* ── Wire open/close to window globals ─────────────────── */
  function openMtgTreeModal() {
    ensureData(() => tree.open());
  }
  window.openMtgTreeModal  = openMtgTreeModal;
  window.closeMtgTreeModal = tree.close;

})();
