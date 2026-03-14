// ═══════════════════════════════════════════════════════════════
//  MERMAID DIAGRAM VIEWER — Mermaid plugin for createVizDiagram
//
//  Provides the Mermaid-specific pipeline (parser, layout engine,
//  renderer, filter logic) consumed by the generic createVizDiagram
//  factory in VIZ.JS.  All lifecycle plumbing (modal, pan/zoom,
//  filter pills, explore tour, camera fit, keyboard nav) is
//  handled by the engine.
//
//  Sections:
//    1. Parser — lightweight `graph TD` subset
//    2. Legend extractor — filter definitions from Legend subgraph
//    3. Layout engine — recursive subgraph positioning
//    4. Renderer — DOM tiles + SVG edges + hover wiring
//    5. Filter system — AST pruning + static visibility toggle
//    6. Static filter — neighbour dimming + explore glow
//    7. Factory — createDiagram() wraps createVizDiagram()
//    7b. openMermaidModal() — generic entry point
//
//  Depends on: VIZ.JS (createVizDiagram, initPanZoom,
//              createFilterSystem, createExploreHint,
//              animateCameraFit, createLayoutToggle,
//              createCrossfader, initVizKeyboardNav)
//              MODALS.JS (registerModal)
// ═══════════════════════════════════════════════════════════════
(() => {

  /* ─── Shared constants ─────────────────────────────────────── */
  const NODE_W = 150;
  const NODE_H = 76;
  const NODE_GAP_X = 20;
  const NODE_GAP_Y = 30;
  const SUBGRAPH_PAD = 16;
  const SUBGRAPH_HEADER = 32;
  const SECTION_GAP = 28;
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 1.5;

  /* ─── Derive color map from classDef stroke values ────────── */
  function colorsFromAST(classDefs) {
    var colors = {};
    Object.keys(classDefs).forEach(function(cls) {
      var hex = (classDefs[cls].stroke || "").replace(/^#/, "");
      if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      if (hex.length === 6) {
        colors[cls] = parseInt(hex.slice(0,2),16)+","+parseInt(hex.slice(2,4),16)+","+parseInt(hex.slice(4,6),16);
      }
    });
    return colors;
  }

  /* ═════════════════════════════════════════════════════════════
     1. MERMAID PARSER — Lightweight subset for `graph TD`
     ═════════════════════════════════════════════════════════════ */

  function parseMermaid(src) {
    const lines = src.split("\n").map(l => l.trimEnd());
    const nodes = {};
    const edges = [];
    const subgraphs = [];
    const classDefs = {};
    const classAssigns = {};
    const subgraphStack = [];
    let title = "";

    // Pre-pass: classDefs, class assignments, title
    for (const rawLine of lines) {
      const line = rawLine.trim();
      const titleMatch = line.match(/^title:\s*(.+)/);
      if (titleMatch) { title = titleMatch[1].trim(); continue; }
      const cdMatch = line.match(/^classDef\s+(\w+)\s+(.+)/);
      if (cdMatch) {
        const props = {};
        cdMatch[2].split(",").forEach(pair => {
          const [k, ...rest] = pair.split(":");
          if (k && rest.length) props[k.trim()] = rest.join(":").trim();
        });
        classDefs[cdMatch[1]] = props;
        continue;
      }
      const caMatch = line.match(/^class\s+(.+?)\s+(\w+)\s*$/);
      if (caMatch) {
        caMatch[1].split(",").map(s => s.trim()).forEach(id => { classAssigns[id] = caMatch[2]; });
      }
    }

    // Pre-scan subgraph IDs
    const subgraphIdSet = new Set();
    for (const rawLine of lines) {
      const m = rawLine.trim().match(/^subgraph\s+(\w+)/);
      if (m) subgraphIdSet.add(m[1]);
    }

    // Main pass
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("%%") || line.startsWith("---") || line === "``" + "`mermaid" || line === "``" + "`") continue;
      if (line.startsWith("graph ") || line.startsWith("title:")) continue;
      if (line.startsWith("classDef ") || line.startsWith("class ") || line.startsWith("style ")) continue;

      // direction
      const dirMatch = line.match(/^direction\s+(TB|LR|BT|RL)$/i);
      if (dirMatch) {
        if (subgraphStack.length) subgraphStack[subgraphStack.length - 1].direction = dirMatch[1].toUpperCase();
        continue;
      }

      // subgraph
      const sgMatch = line.match(/^subgraph\s+(\w+)\s*(?:\["(.*)"\])?\s*$/);
      if (sgMatch) {
        const sg = {
          id: sgMatch[1], label: sgMatch[2] || sgMatch[1],
          direction: "TB", children: [], childSubgraphs: [], orderedChildren: [],
          parent: subgraphStack.length ? subgraphStack[subgraphStack.length - 1].id : null,
        };
        if (subgraphStack.length) {
          subgraphStack[subgraphStack.length - 1].childSubgraphs.push(sg.id);
          subgraphStack[subgraphStack.length - 1].orderedChildren.push({ type: 'sg', id: sg.id });
        }
        subgraphs.push(sg);
        subgraphStack.push(sg);
        continue;
      }

      if (line === "end") { subgraphStack.pop(); continue; }
      if (line.includes("~~~")) continue;

      // Edge
      const edgeMatch = line.match(/^(\w+)\s+(-->|-.->)\s*(?:\|"?([^"|]*)"?\|\s*)?(\w+)\s*$/);
      if (edgeMatch) {
        edges.push({ from: edgeMatch[1], to: edgeMatch[4], label: (edgeMatch[3] || "").replace(/\\n/g, "\n"), dashed: edgeMatch[2] === "-.->" });
        [edgeMatch[1], edgeMatch[4]].forEach(id => {
          if (!nodes[id] && !subgraphIdSet.has(id)) nodes[id] = { id, label: id, htmlLabel: "", classes: [] };
        });
        continue;
      }

      // Node definition
      const nodeMatch = line.match(/^(\w+)\s*\["(.*)"\]\s*(?::::(\w+))?\s*$/);
      if (nodeMatch) {
        const id = nodeMatch[1], rawLabel = nodeMatch[2], inlineCls = nodeMatch[3] || null;
        const parts = rawLabel.split("\\n");
        function stripHtml(s) { return s.replace(/<[^>]+>/g, "").trim(); }
        function extractText(s) { var m = s.match(/<i>(.*?)<\/i>/); return m ? m[1].trim() : stripHtml(s); }
        var titlePart = stripHtml(parts[0]);
        // For 3-line nodes: lines 1+2 = two-line title, line 3 = description
        // For 4+ line nodes: line 1 = title, line 2 = subtitle, lines 3+ = description
        // For 2-line nodes: line 1 = title, line 2 = subtitle only
        var subtitle = "", description = "";
        if (parts.length === 3) {
          subtitle = extractText(parts[1]);
          description = extractText(parts[2]);
        } else if (parts.length >= 4) {
          subtitle = extractText(parts[1]);
          description = parts.slice(2).map(extractText).filter(Boolean).join(" · ");
        } else if (parts.length === 2) {
          subtitle = extractText(parts[1]);
        }
        nodes[id] = { id, label: titlePart, subtitle: subtitle, description: description, htmlLabel: rawLabel, classes: inlineCls ? [inlineCls] : [] };
        if (subgraphStack.length) {
          subgraphStack[subgraphStack.length - 1].children.push(id);
          subgraphStack[subgraphStack.length - 1].orderedChildren.push({ type: 'node', id });
        }
        if (inlineCls) classAssigns[id] = inlineCls;
        continue;
      }

      // Bare node reference
      const bareMatch = line.match(/^(\w+)\s*$/);
      if (bareMatch && subgraphStack.length) {
        const id = bareMatch[1];
        if (nodes[id]) subgraphStack[subgraphStack.length - 1].children.push(id);
      } else if (!bareMatch) {
        // unmatched line — silently skip
      }
    }

    Object.keys(classAssigns).forEach(id => {
      if (nodes[id] && !nodes[id].classes.includes(classAssigns[id])) nodes[id].classes.push(classAssigns[id]);
    });

    return { title, nodes, edges, subgraphs, classDefs, classAssigns };
  }

  /* ── Subgraph class inference ─────────────────────────────── */
  // Derive an effective class for a subgraph from its children's
  // dominant class.  If all (classed) children share a single class,
  // that becomes the subgraph's class.  Otherwise returns "".
  function inferSubgraphClass(sgId, ast) {
    const sgMap = new Map();
    ast.subgraphs.forEach(sg => sgMap.set(sg.id, sg));
    const sg = sgMap.get(sgId);
    if (!sg) return "";
    const childClasses = new Set();
    const visited = new Set();
    function walk(s) {
      if (visited.has(s.id)) return;
      visited.add(s.id);
      (s.children || []).forEach(id => {
        const cls = ast.classAssigns[id] || (ast.nodes[id] && ast.nodes[id].classes && ast.nodes[id].classes[0]) || "";
        if (cls && cls !== "footer") childClasses.add(cls);
      });
      (s.childSubgraphs || []).forEach(cid => {
        const ch = sgMap.get(cid);
        if (ch) walk(ch);
      });
    }
    walk(sg);
    return childClasses.size === 1 ? [...childClasses][0] : "";
  }

  /* ═════════════════════════════════════════════════════════════
     2. LEGEND EXTRACTOR — pulls filter definitions from Legend
     ═════════════════════════════════════════════════════════════ */

  function extractLegend(ast) {
    const legendIds = new Set();
    ast.subgraphs.forEach(sg => {
      if (sg.id === "Legend" || sg.id.startsWith("Legend")) legendIds.add(sg.id);
    });
    const legendNodes = [];
    const legendNodeIds = new Set();
    const legendVisited = new Set();
    function walkLegend(sg) {
      if (legendVisited.has(sg.id)) return;
      legendVisited.add(sg.id);
      // Recurse into child subgraphs FIRST so nested legend items
      // (Hosting, Config, …) appear before direct children (Output),
      // matching the visual top-to-bottom order in the .md source.
      (sg.childSubgraphs || []).forEach(cid => {
        const ch = ast.subgraphs.find(s => s.id === cid);
        if (ch) walkLegend(ch);
      });
      (sg.children || []).forEach(id => {
        const node = ast.nodes[id];
        if (node) {
          const cls = ast.classAssigns[id] || (node.classes && node.classes[0]) || "";
          if (cls && cls !== "footer") {
            legendNodes.push({ id, label: node.label, cls });
            legendNodeIds.add(id);
          }
        }
      });
    }
    ast.subgraphs.filter(sg => sg.id === "Legend").forEach(walkLegend);
    return { legendNodes, legendIds, legendNodeIds };
  }

  /* ═════════════════════════════════════════════════════════════
     3. LAYOUT ENGINE
     ═════════════════════════════════════════════════════════════ */

  function collectAllNodes(sg, sgMap, set, _visited) {
    if (!_visited) _visited = new Set();
    if (_visited.has(sg.id)) return;
    _visited.add(sg.id);
    (sg.children || []).forEach(id => set.add(id));
    (sg.childSubgraphs || []).forEach(id => {
      const child = sgMap.get(id);
      if (child) collectAllNodes(child, sgMap, set, _visited);
    });
  }

  function layoutSubgraph(sg, ast, sgMap, _visited) {
    if (!_visited) _visited = new Set();
    if (_visited.has(sg.id)) return { w: 0, h: 0, nodePositions: new Map() };
    _visited.add(sg.id);
    const dir = sg.direction || "TB";
    const isHoriz = dir === "LR" || dir === "RL";
    const childSGs = (sg.childSubgraphs || []).map(id => sgMap.get(id)).filter(Boolean);
    const childSGNodeIds = new Set();
    childSGs.forEach(csg => collectAllNodes(csg, sgMap, childSGNodeIds));
    const directNodes = (sg.children || []).filter(id => !childSGNodeIds.has(id) && ast.nodes[id]);
    const childLayouts = childSGs.map(csg => ({ sg: csg, layout: layoutSubgraph(csg, ast, sgMap, _visited) }));
    const positions = new Map();
    let contentW = 0, contentH = 0;

    if (isHoriz) {
      const cy = SUBGRAPH_PAD + SUBGRAPH_HEADER;
      const maxPerRow = childLayouts.length;
      let cx = SUBGRAPH_PAD, rowY = cy, rowH = 0, rowMaxW = 0;

      childLayouts.forEach(({ sg: csg, layout }, idx) => {
        if (idx > 0 && idx % maxPerRow === 0) {
          rowMaxW = Math.max(rowMaxW, cx - NODE_GAP_X + SUBGRAPH_PAD);
          rowY += rowH + NODE_GAP_Y;
          cx = SUBGRAPH_PAD;
          rowH = 0;
        }
        csg._layoutX = cx; csg._layoutY = rowY;
        csg._layoutW = layout.w; csg._layoutH = layout.h;
        layout.nodePositions.forEach((pos, id) => { positions.set(id, { x: cx + pos.x, y: rowY + pos.y }); });
        cx += layout.w + NODE_GAP_X;
        rowH = Math.max(rowH, layout.h);
      });
      rowMaxW = Math.max(rowMaxW, cx - NODE_GAP_X + SUBGRAPH_PAD);
      if (directNodes.length) {
        if (childLayouts.length) { rowY += rowH + NODE_GAP_Y; rowH = 0; }
        directNodes.forEach(nodeId => {
          positions.set(nodeId, { x: cx + NODE_W / 2, y: rowY + NODE_H / 2 });
          cx += NODE_W + NODE_GAP_X;
        });
        rowMaxW = Math.max(rowMaxW, cx - NODE_GAP_X + SUBGRAPH_PAD);
        rowH = Math.max(rowH, NODE_H);
      }
      contentW = rowMaxW;
      contentH = rowY + rowH + SUBGRAPH_PAD;
    } else {
      let cy = SUBGRAPH_PAD + SUBGRAPH_HEADER, maxW = 0;
      // Build a lookup for child subgraph layouts
      const clMap = new Map();
      childLayouts.forEach(cl => clMap.set(cl.sg.id, cl));
      // Walk items in declaration order, grouping consecutive direct nodes
      const ordered = sg.orderedChildren || [];
      const directNodeSet = new Set(directNodes);

      // ── Pass 1: compute total maxW across all items ──
      const chunks = []; // { type:'nodes', ids:[] } or { type:'sg', id }
      let curNodes = [];
      ordered.forEach(item => {
        if (item.type === 'node' && directNodeSet.has(item.id)) {
          curNodes.push(item.id);
        } else if (item.type === 'sg' && clMap.has(item.id)) {
          if (curNodes.length) { chunks.push({ type: 'nodes', ids: curNodes }); curNodes = []; }
          chunks.push({ type: 'sg', id: item.id });
        }
      });
      if (curNodes.length) chunks.push({ type: 'nodes', ids: curNodes });

      chunks.forEach(chunk => {
        if (chunk.type === 'sg') {
          const { layout } = clMap.get(chunk.id);
          maxW = Math.max(maxW, layout.w + SUBGRAPH_PAD * 2);
        } else {
          const cols = isHoriz ? Math.min(3, chunk.ids.length) : 1;
          const gridW = cols * NODE_W + (cols - 1) * NODE_GAP_X;
          maxW = Math.max(maxW, gridW + SUBGRAPH_PAD * 2);
        }
      });

      // ── Pass 2: position everything, centering nodes within final maxW ──
      chunks.forEach(chunk => {
        if (chunk.type === 'sg') {
          const { sg: csg, layout } = clMap.get(chunk.id);
          const sgX = Math.max(SUBGRAPH_PAD, (maxW - layout.w) / 2);
          csg._layoutX = sgX; csg._layoutY = cy;
          csg._layoutW = layout.w; csg._layoutH = layout.h;
          layout.nodePositions.forEach((pos, id) => { positions.set(id, { x: sgX + pos.x, y: cy + pos.y }); });
          cy += layout.h + NODE_GAP_Y;
        } else {
          const ids = chunk.ids;
          const cols = isHoriz ? Math.min(3, ids.length) : 1;
          const rows = Math.ceil(ids.length / cols);
          const gridW = cols * NODE_W + (cols - 1) * NODE_GAP_X;
          const startX = (maxW - gridW) / 2;
          ids.forEach((nodeId, idx) => {
            const col = idx % cols, row = Math.floor(idx / cols);
            positions.set(nodeId, {
              x: Math.max(SUBGRAPH_PAD, startX) + col * (NODE_W + NODE_GAP_X) + NODE_W / 2,
              y: cy + row * (NODE_H + NODE_GAP_Y) + NODE_H / 2,
            });
          });
          cy += rows * NODE_H + (rows - 1) * NODE_GAP_Y + NODE_GAP_Y;
        }
      });

      contentW = Math.max(maxW, SUBGRAPH_PAD * 2 + NODE_W);
      contentH = cy - NODE_GAP_Y + SUBGRAPH_PAD;
    }

    return {
      w: Math.max(contentW, 100),
      h: Math.max(contentH, SUBGRAPH_HEADER + NODE_H + SUBGRAPH_PAD * 2),
      nodePositions: positions,
    };
  }

  /* ═════════════════════════════════════════════════════════════
     4. RENDERER
     ═════════════════════════════════════════════════════════════ */

  function buildDiagram(ast, colors, world, svgLayer, legendIds, isExploring) {
    if (!isExploring) isExploring = function() { return false; };
    world.innerHTML = "";
    svgLayer.innerHTML = "";
    world.appendChild(svgLayer);

    const sgMap = new Map();
    ast.subgraphs.forEach(sg => sgMap.set(sg.id, sg));
    // Skip Legend subgraphs from layout
    const topLevel = ast.subgraphs.filter(sg => !sg.parent && !legendIds.has(sg.id));
    const topLayouts = topLevel.map(sg => ({ sg, layout: layoutSubgraph(sg, ast, sgMap) }));

    // Find orphan nodes (not inside any subgraph)
    const ownedNodes = new Set();
    ast.subgraphs.forEach(sg => {
      const allNodes = new Set();
      collectAllNodes(sg, sgMap, allNodes);
      allNodes.forEach(id => ownedNodes.add(id));
    });
    const orphanNodes = Object.keys(ast.nodes).filter(id => !ownedNodes.has(id) && !legendIds.has(id));

    let maxW = 0;
    topLayouts.forEach(tl => { maxW = Math.max(maxW, tl.layout.w); });
    if (orphanNodes.length) {
      const orphanGridW = orphanNodes.length * NODE_W + (orphanNodes.length - 1) * NODE_GAP_X + SUBGRAPH_PAD * 2;
      maxW = Math.max(maxW, orphanGridW);
    }

    const globalPositions = new Map();
    let offsetY = SECTION_GAP;

    // Build a top-level ordering that interleaves subgraphs and orphan nodes
    // by tracking their declaration order in the source
    const topSgSet = new Set(topLevel.map(sg => sg.id));
    const topSgLayoutMap = new Map();
    topLayouts.forEach(tl => topSgLayoutMap.set(tl.sg.id, tl));
    const orphanSet = new Set(orphanNodes);

    // Walk all parsed items in order: subgraphs (by first appearance) and orphan nodes
    const topOrder = [];
    const seenSgs = new Set();
    // Subgraphs appear in ast.subgraphs in declaration order
    // Orphan nodes appear in ast.nodes in insertion order (declaration order)
    // We need to interleave them. Use a combined approach:
    // Walk the source order from the parser. Subgraphs are in ast.subgraphs order.
    // Orphan nodes are in Object.keys(ast.nodes) order.
    // Since the parser processes lines top-to-bottom, both preserve source order.
    // Merge them by checking edges or just appending subgraphs then placing orphans after related subgraphs.
    // Simple approach: place each top-level subgraph, then after it place any orphan nodes that connect to it.
    // Simplest correct approach: subgraphs in order, orphan nodes grouped as a row between them based on declaration.

    // For now, just place top-level subgraphs and orphans in ast order
    topLevel.forEach(sg => {
      const tl = topSgLayoutMap.get(sg.id);
      const xOff = (maxW - tl.layout.w) / 2;
      tl.sg._globalX = xOff; tl.sg._globalY = offsetY;
      tl.sg._globalW = tl.layout.w; tl.sg._globalH = tl.layout.h;
      tl.layout.nodePositions.forEach((pos, id) => {
        globalPositions.set(id, { x: xOff + pos.x, y: offsetY + pos.y });
      });
      offsetY += tl.layout.h + SECTION_GAP;
    });

    // Place orphan nodes as a centered row
    if (orphanNodes.length) {
      const totalNodesW = orphanNodes.length * NODE_W + (orphanNodes.length - 1) * NODE_GAP_X;
      const startX = (maxW - totalNodesW) / 2;
      orphanNodes.forEach((nodeId, idx) => {
        globalPositions.set(nodeId, {
          x: startX + idx * (NODE_W + NODE_GAP_X) + NODE_W / 2,
          y: offsetY + NODE_H / 2,
        });
      });
      offsetY += NODE_H + SECTION_GAP;
    }

    const totalH = offsetY;

    // ── Subgraph containers ──────────────────────────────────
    const renderVisited = new Set();
    function renderSubgraph(sg, parentX, parentY) {
      if (renderVisited.has(sg.id)) return;
      renderVisited.add(sg.id);
      const gx = sg._globalX !== undefined ? sg._globalX : (sg._layoutX || 0) + parentX;
      const gy = sg._globalY !== undefined ? sg._globalY : (sg._layoutY || 0) + parentY;
      const gw = sg._globalW !== undefined ? sg._globalW : sg._layoutW || 200;
      const gh = sg._globalH !== undefined ? sg._globalH : sg._layoutH || 100;
      const isInvisible = !sg.label || sg.label.trim() === "" || sg.label === sg.id;
      const c = document.createElement("div");
      c.className = "mm-subgraph" + (isInvisible ? " mm-subgraph-invisible" : "");
      c.dataset.mmSg = sg.id;
      c.style.left = gx + "px"; c.style.top = gy + "px";
      c.style.width = gw + "px"; c.style.height = gh + "px";
      if (!isInvisible) {
        const h = document.createElement("div");
        h.className = "mm-subgraph-header";
        h.textContent = sg.label;
        c.appendChild(h);
      }
      world.appendChild(c);
      (sg.childSubgraphs || []).forEach(cid => {
        const ch = sgMap.get(cid); if (ch) renderSubgraph(ch, gx, gy);
      });
    }
    topLayouts.forEach(tl => renderSubgraph(tl.sg, 0, 0));

    // ── Subgraph bounds for edge routing ─────────────────────
    const sgBounds = new Map();
    const boundsVisited = new Set();
    function collectSgBounds(sg, px, py) {
      if (boundsVisited.has(sg.id)) return;
      boundsVisited.add(sg.id);
      const gx = sg._globalX !== undefined ? sg._globalX : (sg._layoutX || 0) + px;
      const gy = sg._globalY !== undefined ? sg._globalY : (sg._layoutY || 0) + py;
      const gw = sg._globalW !== undefined ? sg._globalW : sg._layoutW || 200;
      const gh = sg._globalH !== undefined ? sg._globalH : sg._layoutH || 100;
      sgBounds.set(sg.id, { cx: gx + gw / 2, cy: gy + gh / 2, x: gx, y: gy, w: gw, h: gh });
      (sg.childSubgraphs || []).forEach(cid => {
        const ch = sgMap.get(cid); if (ch) collectSgBounds(ch, gx, gy);
      });
    }
    topLayouts.forEach(tl => collectSgBounds(tl.sg, 0, 0));

    // ── Node tiles ───────────────────────────────────────────
    const nodeElements = {};
    Object.values(ast.nodes).forEach(node => {
      const pos = globalPositions.get(node.id);
      if (!pos) return;
      const cls = ast.classAssigns[node.id] || (node.classes && node.classes[0]) || "";
      const tc = colors[cls] || "255,255,255";
      const el = document.createElement("div");
      el.className = "mm-node";
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "img");
      el.setAttribute("aria-label", (node.label || node.id) + (node.subtitle ? ", " + node.subtitle : "") + (node.description ? ", " + node.description : ""));
      el.dataset.mmId = node.id;
      if (cls) el.dataset.mmClass = cls;
      el.style.setProperty("--tc", tc);
      el.style.left = (pos.x - NODE_W / 2) + "px";
      el.style.top = (pos.y - NODE_H / 2) + "px";
      el.style.width = NODE_W + "px";
      el.style.height = NODE_H + "px";
      const tEl = document.createElement("div");
      tEl.className = "mm-node-title";
      tEl.textContent = node.label || node.id;
      el.appendChild(tEl);
      if (node.subtitle) {
        const sEl = document.createElement("div");
        // 3-line nodes: subtitle is a second title row (bold, not italic)
        // 2-line or 4+ line nodes: subtitle is italic detail
        sEl.className = node.description ? "mm-node-title" : "mm-node-subtitle";
        sEl.textContent = node.subtitle;
        el.appendChild(sEl);
      }
      if (node.description) {
        const dEl = document.createElement("div");
        dEl.className = "mm-node-desc";
        dEl.textContent = node.description;
        el.appendChild(dEl);
      }
      const acc = document.createElement("div");
      acc.className = "mm-node-accent";
      acc.style.background = "linear-gradient(135deg, rgba(" + tc + ",0.15) 0%, transparent 60%)";
      el.appendChild(acc);
      world.appendChild(el);
      nodeElements[node.id] = { el, x: pos.x, y: pos.y, cls };
    });

    // ── SVG edges ────────────────────────────────────────────
    const svgNS = "http://www.w3.org/2000/svg";
    const svgW = maxW + SECTION_GAP * 2;
    const svgH = totalH + SECTION_GAP;
    // The SVG gets its coordinate system from the viewBox attribute
    // (set in HTML as "0 0 6000 6000") and display size from CSS
    // (width: 6000px; height: 6000px). This gives 1:1 mapping.
    svgLayer.removeAttribute("width");
    svgLayer.removeAttribute("height");

    let defs = svgLayer.querySelector("defs");
    if (!defs) { defs = document.createElementNS(svgNS, "defs"); svgLayer.prepend(defs); }

    // Unique IDs per instance to avoid SVG marker collisions
    const uid = Math.random().toString(36).slice(2, 8);

    // Create arrowhead markers per color class + a default white one
    const markerCache = {};
    function getMarkerId(tc, dashed) {
      const key = tc + (dashed ? "-d" : "");
      if (markerCache[key]) return markerCache[key];
      const mid = "mm-arr-" + uid + "-" + key.replace(/[^a-z0-9]/gi, "");
      const mk = document.createElementNS(svgNS, "marker");
      mk.setAttribute("id", mid); mk.setAttribute("viewBox", "0 0 10 10");
      mk.setAttribute("refX", "10"); mk.setAttribute("refY", "5");
      mk.setAttribute("markerWidth", "8"); mk.setAttribute("markerHeight", "8");
      mk.setAttribute("orient", "auto-start-reverse"); mk.setAttribute("markerUnits", "userSpaceOnUse");
      const ap = document.createElementNS(svgNS, "path");
      ap.setAttribute("d", "M 0 1 L 10 5 L 0 9 z");
      ap.setAttribute("fill", dashed ? "rgba(" + tc + ",0.5)" : "rgb(" + tc + ")");
      ap.setAttribute("class", "mm-arrow-head");
      mk.appendChild(ap); defs.appendChild(mk);
      markerCache[key] = mid;
      return mid;
    }

    // Draw edges
    const edgePathLayer = document.createElementNS(svgNS, "g");
    edgePathLayer.classList.add("mm-edge-path-layer");
    edgePathLayer.style.isolation = "isolate";
    const edgeElements = [];
    let edgeCount = 0;
    ast.edges.forEach(edge => {
      let fromPt = nodeElements[edge.from], toPt = nodeElements[edge.to];
      let fromSg = null, toSg = null;
      if (!fromPt && sgBounds.has(edge.from)) { const b = sgBounds.get(edge.from); fromPt = { x: b.cx, y: b.cy, cls: inferSubgraphClass(edge.from, ast) }; fromSg = b; }
      if (!toPt && sgBounds.has(edge.to))     { const b = sgBounds.get(edge.to);   toPt   = { x: b.cx, y: b.cy, cls: inferSubgraphClass(edge.to, ast) };   toSg   = b; }
      if (!fromPt || !toPt) { return; }

      // Determine edge color: prefer the SOURCE's class so the arrow
      // color reflects where the signal / power originates from.
      // Special case: if exactly one end is "hosting", use the other.
      const fCls = fromPt.cls || "";
      const tCls = toPt.cls || "";
      let edgeCls;
      if (fCls && tCls && fCls !== tCls) {
        edgeCls = (fCls === "hosting") ? tCls : fCls;
      } else {
        edgeCls = fCls || tCls || "";
      }
      const edgeTC = colors[edgeCls] || "255,255,255";

      const fHH = fromSg ? fromSg.h / 2 : NODE_H / 2;
      const tHH = toSg   ? toSg.h / 2   : NODE_H / 2;
      const fHW = fromSg ? fromSg.w / 2 : NODE_W / 2;
      const tHW = toSg   ? toSg.w / 2   : NODE_W / 2;

      // Determine direction: horizontal if roughly same Y, else vertical
      const dy = Math.abs(toPt.y - fromPt.y);
      const sameRow = dy < Math.min(fHH, tHH);
      let x1, y1, x2, y2;

      if (sameRow) {
        // Horizontal arrow — exit/enter from sides
        const goingRight = toPt.x >= fromPt.x;
        x1 = fromPt.x + (goingRight ?  fHW : -fHW);
        y1 = fromPt.y;
        x2 = toPt.x   + (goingRight ? -tHW :  tHW);
        y2 = toPt.y;
      } else {
        // Vertical arrow — exit/enter from top/bottom
        const goingUp = toPt.y < fromPt.y;
        if (goingUp) {
          x1 = fromPt.x; y1 = fromPt.y - fHH;
          x2 = toPt.x;   y2 = toPt.y + tHH;
        } else {
          x1 = fromPt.x; y1 = fromPt.y + fHH;
          x2 = toPt.x;   y2 = toPt.y - tHH;
        }
      }

      const path = document.createElementNS(svgNS, "path");
      if (sameRow) {
        // Straight horizontal line
        path.setAttribute("d", "M" + x1 + "," + y1 + " L" + x2 + "," + y2);
      } else {
        const goingUp = toPt.y < fromPt.y;
        const gap = Math.abs(y2 - y1);
        if (!goingUp && gap > 0) {
          // Normal downward flow — smooth vertical bezier
          const cy = Math.max(gap * 0.45, 30);
          path.setAttribute("d", "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 + cy) + " " + x2 + "," + (y2 - cy) + " " + x2 + "," + y2);
        } else if (goingUp) {
          // Upward flow — exit top, curve upward to enter bottom of target
          const cy = Math.max(gap * 0.45, 30);
          path.setAttribute("d", "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 - cy) + " " + x2 + "," + (y2 + cy) + " " + x2 + "," + y2);
        } else {
          // Fallback straight line
          path.setAttribute("d", "M" + x1 + "," + y1 + " L" + x2 + "," + y2);
        }
      }
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", edge.dashed
        ? "rgba(" + edgeTC + ",0.5)"
        : "rgb(" + edgeTC + ")");
      path.setAttribute("stroke-width", edge.dashed ? "1.5" : "2");
      path.setAttribute("stroke-linecap", "round");
      if (edge.dashed) path.setAttribute("stroke-dasharray", "6 4");
      path.setAttribute("marker-end", "url(#" + getMarkerId(edgeTC, edge.dashed) + ")");
      path.classList.add("mm-edge", "mm-thread");
      path.dataset.mmFrom = edge.from;
      path.dataset.mmTo = edge.to;
      edgePathLayer.appendChild(path);

      // Collect endpoint classes for filtering
      const fromCls = fromPt.cls || "";
      const toCls = toPt.cls || "";
      const edgeClasses = new Set();
      if (fromCls) edgeClasses.add(fromCls);
      if (toCls) edgeClasses.add(toCls);

      let labelGroup = null;
      // Edge label
      if (edge.label) {
        const lx = (x1 + x2) / 2, ly = (y1 + y2) / 2;
        const g = document.createElementNS(svgNS, "g");
        g.classList.add("mm-edge-label-group");
        if (edge.dashed) g.classList.add("mm-dashed-label");
        g.dataset.mmFrom = edge.from;
        g.dataset.mmTo = edge.to;
        const labelLines = edge.label.split("\n");
        const lh = 12, totalLH = labelLines.length * lh;
        const maxLen = Math.max(...labelLines.map(l => l.length));
        const bw = maxLen * 7 + 16, bh = totalLH + 8;
        const bg = document.createElementNS(svgNS, "rect");
        bg.setAttribute("x", lx - bw / 2); bg.setAttribute("y", ly - bh / 2);
        bg.setAttribute("width", bw); bg.setAttribute("height", bh);
        bg.setAttribute("rx", "6"); bg.setAttribute("fill", "rgba(15,15,20,0.95)");
        bg.setAttribute("stroke", "rgba(255,255,255,0.25)"); bg.setAttribute("stroke-width", "0.5");
        g.appendChild(bg);
        labelLines.forEach((ln, i) => {
          const t = document.createElementNS(svgNS, "text");
          t.setAttribute("x", lx); t.setAttribute("y", ly - totalLH / 2 + i * lh + lh - 2);
          t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "rgba(255,255,255,1)");
          t.setAttribute("font-size", "10"); t.setAttribute("font-family", "system-ui, sans-serif");
          t.setAttribute("font-weight", "600"); t.textContent = ln;
          g.appendChild(t);
        });
        labelGroup = g;
      }
      edgeElements.push({ path, labelGroup, classes: edgeClasses, from: edge.from, to: edge.to });
      edgeCount++;
    });

    // Append label badges (rects) first, then label text on top,
    // so text is never hidden behind another label's background.
    // We split each label <g> into two layers while keeping the
    // parent <g> in the DOM for visibility toggling.
    const labelBgLayer = document.createElementNS(svgNS, "g");
    labelBgLayer.classList.add("mm-label-bg-layer");
    const labelTxtLayer = document.createElementNS(svgNS, "g");
    labelTxtLayer.classList.add("mm-label-txt-layer");
    edgeElements.forEach(({ labelGroup: lg }, idx) => {
      if (!lg) return;
      // Clone data attributes onto sub-wrappers for filtering
      const bgWrap = document.createElementNS(svgNS, "g");
      bgWrap.classList.add("mm-edge-label-group");
      bgWrap.dataset.mmFrom = lg.dataset.mmFrom;
      bgWrap.dataset.mmTo = lg.dataset.mmTo;
      if (lg.classList.contains("mm-dashed-label")) bgWrap.classList.add("mm-dashed-label");
      const txtWrap = document.createElementNS(svgNS, "g");
      txtWrap.classList.add("mm-edge-label-group");
      txtWrap.dataset.mmFrom = lg.dataset.mmFrom;
      txtWrap.dataset.mmTo = lg.dataset.mmTo;
      if (lg.classList.contains("mm-dashed-label")) txtWrap.classList.add("mm-dashed-label");
      // Move rect to bg layer, text elements to txt layer
      const children = Array.from(lg.children);
      children.forEach(child => {
        if (child.tagName === "rect") bgWrap.appendChild(child);
        else txtWrap.appendChild(child);
      });
      labelBgLayer.appendChild(bgWrap);
      labelTxtLayer.appendChild(txtWrap);
      // Update edgeElement to reference the live DOM wrappers
      edgeElements[idx].labelBg = bgWrap;
      edgeElements[idx].labelTxt = txtWrap;
    });
    svgLayer.appendChild(edgePathLayer);
    svgLayer.appendChild(labelBgLayer);
    svgLayer.appendChild(labelTxtLayer);

    // ── World dimensions ─────────────────────────────────────
    world.style.width = svgW + "px";
    world.style.height = svgH + "px";

    // ── Title ────────────────────────────────────────────────
    if (ast.title) {
      const t = document.createElement("div");
      t.className = "mm-title"; t.textContent = ast.title;
      world.insertBefore(t, world.firstChild);
    }

    // ── Footer ───────────────────────────────────────────────
    if (ast.nodes["Footer"]) {
      const f = document.createElement("div");
      f.className = "mm-footer"; f.textContent = ast.nodes["Footer"].label;
      f.style.top = (totalH - SECTION_GAP / 2) + "px";
      f.style.left = (maxW / 2) + "px";
      world.appendChild(f);
      if (nodeElements["Footer"]) nodeElements["Footer"].el.remove();
    }

    // ── Hover interaction: highlight connected edges & nodes ──
    // Build adjacency: nodeId/sgId → [ { path, labelBg, labelTxt, peerId } ]
    // Uses direct references stored during edge creation (no DOM queries).
    const adjacency = {};
    edgeElements.forEach(({ path, labelBg, labelTxt, from, to }) => {
      if (!adjacency[from]) adjacency[from] = [];
      if (!adjacency[to])   adjacency[to]   = [];
      adjacency[from].push({ path, labelBg, labelTxt, peerId: to });
      adjacency[to].push({   path, labelBg, labelTxt, peerId: from });
    });

    // Subgraph lookup helpers (built early for use in highlight logic)
    const sgNodeMap = {};
    ast.subgraphs.forEach(sg => {
      const nodeSet = new Set();
      collectAllNodes(sg, sgMap, nodeSet);
      sgNodeMap[sg.id] = nodeSet;
    });

    function collectChildSgs(sgId, out) {
      if (out.has(sgId)) return;
      const sg = sgMap.get(sgId);
      if (!sg) return;
      (sg.childSubgraphs || []).forEach(cid => {
        out.add(cid);
        collectChildSgs(cid, out);
      });
    }

    // Highlight an endpoint (could be a node OR a subgraph)
    // Also highlights all ancestor subgraphs so parent opacity doesn't dim children.
    function highlightAncestorSgs(sgId) {
      const sg = sgMap.get(sgId);
      if (!sg || !sg.parent) return;
      let pid = sg.parent;
      while (pid) {
        const pEl = world.querySelector('.mm-subgraph[data-mm-sg="' + pid + '"]');
        if (pEl) pEl.classList.add("mm-highlight");
        const pSg = sgMap.get(pid);
        pid = pSg ? pSg.parent : null;
      }
    }

    function highlightEndpoint(id) {
      if (nodeElements[id]) {
        nodeElements[id].el.classList.add("mm-highlight");
        // Highlight ancestor subgraphs of this node so they don't dim it
        const ancestors = nodeAncestorSgs[id] || [];
        ancestors.forEach(sgId => {
          const sgEl = world.querySelector('.mm-subgraph[data-mm-sg="' + sgId + '"]');
          if (sgEl) sgEl.classList.add("mm-highlight");
        });
      }
      // If this id is a subgraph, highlight the container + children + descendant nodes
      const sgEl = world.querySelector('.mm-subgraph[data-mm-sg="' + id + '"]');
      if (sgEl) {
        sgEl.classList.add("mm-highlight");
        highlightAncestorSgs(id);
        const childSgs = new Set();
        collectChildSgs(id, childSgs);
        childSgs.forEach(cid => {
          const cEl = world.querySelector('.mm-subgraph[data-mm-sg="' + cid + '"]');
          if (cEl) cEl.classList.add("mm-highlight");
        });
        const descendants = sgNodeMap[id];
        if (descendants) {
          descendants.forEach(nid => {
            if (nodeElements[nid]) nodeElements[nid].el.classList.add("mm-highlight");
          });
        }
      }
    }

    function clearHighlights() {
      world.classList.remove("mm-hovering");
      world.querySelectorAll(".mm-highlight").forEach(el => el.classList.remove("mm-highlight"));
      svgLayer.querySelectorAll(".mm-highlight").forEach(el => el.classList.remove("mm-highlight"));
    }

    // Build reverse lookup: nodeId → list of ancestor subgraph IDs
    const nodeAncestorSgs = {};
    ast.subgraphs.forEach(sg => {
      const nodeSet = sgNodeMap[sg.id];
      if (!nodeSet) return;
      nodeSet.forEach(nid => {
        if (!nodeAncestorSgs[nid]) nodeAncestorSgs[nid] = [];
        nodeAncestorSgs[nid].push(sg.id);
      });
    });

    // Node hover → highlight self + connected edges + peer nodes/subgraphs
    // Also checks edges targeting ancestor subgraphs of the hovered node.
    Object.values(nodeElements).forEach(({ el, x, y, cls }) => {
      const id = el.dataset.mmId;
      el.addEventListener("mouseenter", () => {
        if (isExploring()) return;
        world.classList.add("mm-hovering");
        el.classList.add("mm-highlight");
        // Highlight ancestor subgraphs so parent opacity doesn't dim this node
        (nodeAncestorSgs[id] || []).forEach(sgId => {
          const sgEl = world.querySelector('.mm-subgraph[data-mm-sg="' + sgId + '"]');
          if (sgEl) sgEl.classList.add("mm-highlight");
        });
        // Collect adjacency for the node itself and all its ancestor subgraphs
        const idsToCheck = [id].concat(nodeAncestorSgs[id] || []);
        idsToCheck.forEach(checkId => {
          const adj = adjacency[checkId] || [];
          adj.forEach(a => {
            a.path.classList.add("mm-highlight");
            if (a.labelBg)  a.labelBg.classList.add("mm-highlight");
            if (a.labelTxt) a.labelTxt.classList.add("mm-highlight");
            highlightEndpoint(a.peerId);
          });
        });
      });
      el.addEventListener("mouseleave", clearHighlights);
    });

    // Edge hover → highlight the edge + both endpoint nodes/subgraphs
    edgeElements.forEach(({ path: pathEl, labelBg, labelTxt, from: fromId, to: toId }) => {
      pathEl.addEventListener("mouseenter", () => {
        if (isExploring()) return;
        world.classList.add("mm-hovering");
        pathEl.classList.add("mm-highlight");
        if (labelBg)  labelBg.classList.add("mm-highlight");
        if (labelTxt) labelTxt.classList.add("mm-highlight");
        highlightEndpoint(fromId);
        highlightEndpoint(toId);
      });
      pathEl.addEventListener("mouseleave", clearHighlights);
    });

    // Subgraph header hover → highlight all descendant nodes + their edges + peers
    world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(sgEl => {
      const header = sgEl.querySelector(".mm-subgraph-header");
      if (!header) return;
      const sgId = sgEl.dataset.mmSg;
      const descendantNodes = sgNodeMap[sgId];
      if (!descendantNodes || descendantNodes.size === 0) return;

      header.addEventListener("mouseenter", () => {
        if (isExploring()) return;
        world.classList.add("mm-hovering");
        highlightEndpoint(sgId);

        // Collect all IDs to check adjacency for: the subgraph itself,
        // all descendant subgraphs, and all descendant nodes.
        const idsToCheck = [sgId];
        const childSgs = new Set();
        collectChildSgs(sgId, childSgs);
        childSgs.forEach(cid => idsToCheck.push(cid));
        descendantNodes.forEach(nodeId => {
          if (nodeElements[nodeId]) nodeElements[nodeId].el.classList.add("mm-highlight");
          idsToCheck.push(nodeId);
        });

        idsToCheck.forEach(id => {
          const adj = adjacency[id] || [];
          adj.forEach(a => {
            a.path.classList.add("mm-highlight");
            if (a.labelBg)  a.labelBg.classList.add("mm-highlight");
            if (a.labelTxt) a.labelTxt.classList.add("mm-highlight");
            highlightEndpoint(a.peerId);
          });
        });
      });
      header.addEventListener("mouseleave", clearHighlights);
    });

    return { svgW, svgH, nodeElements, edgeElements };
  }

  /* ═════════════════════════════════════════════════════════════
     5. FILTER SYSTEM — rebuilds layout excluding hidden classes
     ═════════════════════════════════════════════════════════════ */

  /**
   * Create a filtered copy of the AST driven by EDGE category.
   *
   * An edge's category uses the "prefer non-hosting" rule (matching the
   * rendering color logic).  We keep every edge whose category is in
   * `keep`, then keep every node that is an endpoint of a surviving edge.
   * Unclassed / footer nodes survive automatically if any edge touches them.
   * Subgraphs that end up empty are collapsed.
   */
  function filterAST(ast, keep) {
    const allActive = keep.size >= Object.keys(ast.classDefs).length;
    if (allActive) {
      // Everything visible — return original AST untouched
      return ast;
    }

    function nodeCls(id) {
      return ast.classAssigns[id] || (ast.nodes[id] && ast.nodes[id].classes && ast.nodes[id].classes[0]) || inferSubgraphClass(id, ast) || "";
    }

    // For subgraph endpoints with mixed children (inferSubgraphClass returns ""),
    // check whether ANY descendant class overlaps with `keep`.
    const _sgClassCache = new Map();
    function subgraphClasses(sgId) {
      if (_sgClassCache.has(sgId)) return _sgClassCache.get(sgId);
      const sgMap = new Map();
      ast.subgraphs.forEach(sg => sgMap.set(sg.id, sg));
      const classes = new Set();
      const visited = new Set();
      function walk(s) {
        if (!s || visited.has(s.id)) return;
        visited.add(s.id);
        (s.children || []).forEach(id => {
          const cls = ast.classAssigns[id] || (ast.nodes[id] && ast.nodes[id].classes && ast.nodes[id].classes[0]) || "";
          if (cls && cls !== "footer") classes.add(cls);
        });
        (s.childSubgraphs || []).forEach(cid => { const ch = sgMap.get(cid); if (ch) walk(ch); });
      }
      walk(sgMap.get(sgId));
      _sgClassCache.set(sgId, classes);
      return classes;
    }

    // Check if an edge endpoint is "ok" for the current filter
    function endpointOk(id) {
      const cls = nodeCls(id);
      if (cls) return keep.has(cls);
      // Unclassed: either a truly unclassed node (always ok) or a mixed subgraph.
      // For mixed subgraphs, require at least one child class to be in `keep`.
      const sgClasses = subgraphClasses(id);
      if (sgClasses.size === 0) return true;  // truly unclassed node
      for (const c of sgClasses) { if (keep.has(c)) return true; }
      return false;
    }

    // 1. Determine which edges survive based on their color-category
    const survivingEdges = [];
    const neededNodeIds = new Set();

    ast.edges.forEach(edge => {
      // Keep edge if AT LEAST ONE endpoint's class is active (or unclassed).
      const fromOk = endpointOk(edge.from);
      const toOk   = endpointOk(edge.to);
      if (fromOk || toOk) {
        survivingEdges.push(edge);
        // Only pull in endpoints that actually belong to the active filter.
        // Foreign endpoints are NOT added — edges to them will be pruned in
        // step 7 if the target node/subgraph doesn't survive, which cleanly
        // clips arrows at the diagram boundary.
        if (fromOk) neededNodeIds.add(edge.from);
        if (toOk)   neededNodeIds.add(edge.to);
      }
    });

    // 2. Also keep any node whose own class is in `keep` (even if no
    //    surviving edge touches it — e.g. a leaf node with no outgoing edges)
    Object.keys(ast.nodes).forEach(id => {
      const cls = nodeCls(id);
      if (!cls || cls === "footer" || keep.has(cls)) neededNodeIds.add(id);
    });

    // 3. Build filtered node map
    const nodes = {};
    neededNodeIds.forEach(id => {
      if (ast.nodes[id]) nodes[id] = ast.nodes[id];
    });

    // 4. (edge filtering moved after subgraph pruning — see step 7)

    // 5. Deep-clone subgraphs with pruned children lists
    function cloneSG(sg) {
      return {
        id: sg.id, label: sg.label, direction: sg.direction, parent: sg.parent,
        children: (sg.children || []).filter(id => !!nodes[id]),
        childSubgraphs: (sg.childSubgraphs || []).slice(),
        orderedChildren: (sg.orderedChildren || []).filter(item =>
          item.type === 'node' ? !!nodes[item.id] : true
        ),
      };
    }
    const subgraphs = ast.subgraphs.map(cloneSG);

    // 6. Collapse empty subgraphs
    const sgMap = new Map();
    subgraphs.forEach(sg => sgMap.set(sg.id, sg));
    function hasContent(sg, _visited) {
      if (!_visited) _visited = new Set();
      if (_visited.has(sg.id)) return false;
      _visited.add(sg.id);
      if (sg.children.length > 0) return true;
      return (sg.childSubgraphs || []).some(cid => {
        const ch = sgMap.get(cid);
        return ch && hasContent(ch, _visited);
      });
    }
    subgraphs.forEach(sg => {
      sg.childSubgraphs = (sg.childSubgraphs || []).filter(cid => {
        const ch = sgMap.get(cid);
        return ch && hasContent(ch);
      });
    });
    const liveSubgraphs = subgraphs.filter(sg => hasContent(sg));
    const liveSgIds = new Set(liveSubgraphs.map(sg => sg.id));

    // Prune orderedChildren of collapsed subgraph references
    liveSubgraphs.forEach(sg => {
      sg.orderedChildren = (sg.orderedChildren || []).filter(item =>
        item.type === 'node' || liveSgIds.has(item.id)
      );
    });

    // 7. Final edge filter: both endpoints must be a node or a surviving subgraph
    const edges = survivingEdges.filter(e => (nodes[e.from] || liveSgIds.has(e.from)) && (nodes[e.to] || liveSgIds.has(e.to)));

    return { title: ast.title, nodes, edges, subgraphs: liveSubgraphs, classDefs: ast.classDefs, classAssigns: ast.classAssigns };
  }

  /* ═════════════════════════════════════════════════════════════
     7. FACTORY — Mermaid-specific plugin for createVizDiagram
     ═════════════════════════════════════════════════════════════ */

  /**
   * _mermaidStaticFilter — static-mode filter logic with
   * neighbour dimming and explore glow, extracted from the
   * original rebuild() so it can be returned as a closure.
   */
  function _mermaidStaticFilter(ast, activeClasses, world, svgLayer, ctx) {
    var filtered = filterAST(ast, activeClasses);
    var liveNodes    = new Set(Object.keys(filtered.nodes));
    var liveSgs      = new Set(filtered.subgraphs.map(function (sg) { return sg.id; }));
    var liveEdgeKeys = new Set(filtered.edges.map(function (e) { return e.from + "->" + e.to; }));

    // Toggle nodes
    world.querySelectorAll(".mm-node[data-mm-id]").forEach(function (el) {
      el.classList.toggle("mm-hidden", !liveNodes.has(el.dataset.mmId));
    });
    // Toggle subgraphs
    world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(function (el) {
      el.classList.toggle("mm-hidden", !liveSgs.has(el.dataset.mmSg));
    });
    // Toggle edges + labels
    svgLayer.querySelectorAll(".mm-edge[data-mm-from]").forEach(function (el) {
      el.classList.toggle("mm-hidden", !liveEdgeKeys.has(el.dataset.mmFrom + "->" + el.dataset.mmTo));
    });
    svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]").forEach(function (el) {
      el.classList.toggle("mm-hidden", !liveEdgeKeys.has(el.dataset.mmFrom + "->" + el.dataset.mmTo));
    });

    // ── Dim neighbours ──
    var allActive = activeClasses.size >= Object.keys(ast.classDefs).length;
    var primaryNodeIds = new Set();
    var primarySgIds   = new Set();
    if (!allActive) {
      Object.keys(filtered.nodes).forEach(function (id) {
        var cls = ast.classAssigns[id] || (ast.nodes[id] && ast.nodes[id].classes && ast.nodes[id].classes[0]) || "";
        if (!cls || cls === "footer" || activeClasses.has(cls)) primaryNodeIds.add(id);
      });
      var sgMap = new Map();
      ast.subgraphs.forEach(function (s) { sgMap.set(s.id, s); });
      filtered.subgraphs.forEach(function (sg) {
        var cls = inferSubgraphClass(sg.id, ast);
        if (cls && activeClasses.has(cls)) {
          primarySgIds.add(sg.id);
        } else if (!cls) {
          var s = sgMap.get(sg.id);
          if (s) {
            var hasActive = false;
            (function walkSg(sub) {
              (sub.children || []).forEach(function (cid) {
                var c = ast.classAssigns[cid] || (ast.nodes[cid] && ast.nodes[cid].classes && ast.nodes[cid].classes[0]) || "";
                if (c && activeClasses.has(c)) hasActive = true;
              });
              (sub.childSubgraphs || []).forEach(function (csid) { var ch = sgMap.get(csid); if (ch) walkSg(ch); });
            })(s);
            if (hasActive) primarySgIds.add(sg.id);
          }
        }
      });
    }

    world.querySelectorAll(".mm-node[data-mm-id]").forEach(function (el) {
      el.classList.toggle("mm-neighbour", !allActive && liveNodes.has(el.dataset.mmId) && !primaryNodeIds.has(el.dataset.mmId));
    });
    world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(function (el) {
      el.classList.toggle("mm-neighbour", !allActive && liveSgs.has(el.dataset.mmSg) && !primarySgIds.has(el.dataset.mmSg));
    });
    svgLayer.querySelectorAll(".mm-edge[data-mm-from]").forEach(function (el) {
      var fp = primaryNodeIds.has(el.dataset.mmFrom) || primarySgIds.has(el.dataset.mmFrom);
      var tp = primaryNodeIds.has(el.dataset.mmTo)   || primarySgIds.has(el.dataset.mmTo);
      el.classList.toggle("mm-neighbour", !allActive && !el.classList.contains("mm-hidden") && !fp && !tp);
    });
    svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]").forEach(function (el) {
      var fp = primaryNodeIds.has(el.dataset.mmFrom) || primarySgIds.has(el.dataset.mmFrom);
      var tp = primaryNodeIds.has(el.dataset.mmTo)   || primarySgIds.has(el.dataset.mmTo);
      el.classList.toggle("mm-neighbour", !allActive && !el.classList.contains("mm-hidden") && !fp && !tp);
    });

    // ── Explore glow ──
    var exploring    = ctx.isExploring();
    var exploreClass = ctx.exploreClass();
    var exploreDur   = ctx.exploreDuration();

    if (exploring && exploreClass) {
      world.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
      svgLayer.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
      world.classList.add("mm-explore-hovering");

      function nodeClassFor(id) {
        return ast.classAssigns[id] || (ast.nodes[id] && ast.nodes[id].classes && ast.nodes[id].classes[0]) || "";
      }
      world.querySelectorAll(".mm-node[data-mm-id]:not(.mm-hidden)").forEach(function (el) {
        if (el.dataset.mmClass === exploreClass) el.classList.add("mm-explore-glow");
      });
      world.querySelectorAll(".mm-subgraph[data-mm-sg]:not(.mm-hidden)").forEach(function (el) {
        if (inferSubgraphClass(el.dataset.mmSg, ast) === exploreClass) el.classList.add("mm-explore-glow");
      });
      svgLayer.querySelectorAll(".mm-edge[data-mm-from]:not(.mm-hidden)").forEach(function (el) {
        var fc = nodeClassFor(el.dataset.mmFrom) || inferSubgraphClass(el.dataset.mmFrom, ast);
        var tc = nodeClassFor(el.dataset.mmTo)   || inferSubgraphClass(el.dataset.mmTo, ast);
        if (fc === exploreClass || tc === exploreClass) el.classList.add("mm-explore-glow");
      });
      svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]:not(.mm-hidden)").forEach(function (el) {
        var fc = nodeClassFor(el.dataset.mmFrom) || inferSubgraphClass(el.dataset.mmFrom, ast);
        var tc = nodeClassFor(el.dataset.mmTo)   || inferSubgraphClass(el.dataset.mmTo, ast);
        if (fc === exploreClass || tc === exploreClass) el.classList.add("mm-explore-glow");
      });

      if (_mmGlowTimer) clearTimeout(_mmGlowTimer);
      _mmGlowTimer = setTimeout(function () {
        world.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
        svgLayer.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
        world.classList.remove("mm-explore-hovering");
      }, exploreDur);
    }

    // ── Compute visible bounds ──
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    var glowSuffix = exploring ? ".mm-explore-glow" : ":not(.mm-neighbour)";
    var nodeSel = ".mm-node[data-mm-id]:not(.mm-hidden)" + glowSuffix;
    var sgSel   = ".mm-subgraph[data-mm-sg]:not(.mm-hidden)" + glowSuffix;

    function accumBounds(el) {
      var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      var w = parseFloat(el.style.width), h = parseFloat(el.style.height);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    }
    world.querySelectorAll(nodeSel).forEach(accumBounds);
    world.querySelectorAll(sgSel).forEach(accumBounds);

    if (exploring) {
      svgLayer.querySelectorAll(".mm-edge.mm-explore-glow").forEach(function (p) {
        try { var bb = p.getBBox(); if (bb.width > 0 || bb.height > 0) { if (bb.x < minX) minX = bb.x; if (bb.y < minY) minY = bb.y; if (bb.x + bb.width > maxX) maxX = bb.x + bb.width; if (bb.y + bb.height > maxY) maxY = bb.y + bb.height; } } catch (e) {}
      });
      svgLayer.querySelectorAll(".mm-edge-label-group.mm-explore-glow").forEach(function (g) {
        try { var bb = g.getBBox(); if (bb.width > 0 || bb.height > 0) { if (bb.x < minX) minX = bb.x; if (bb.y < minY) minY = bb.y; if (bb.x + bb.width > maxX) maxX = bb.x + bb.width; if (bb.y + bb.height > maxY) maxY = bb.y + bb.height; } } catch (e) {}
      });
    }

    if (minX < Infinity) {
      var pad = 20;
      return { bounds: { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 } };
    }
    return null;
  }

  // Shared glow timer for explore cleanup (one per IIFE scope)
  var _mmGlowTimer = null;

  /**
   * createDiagram(cfg) — Mermaid plugin wrapper.
   * Delegates lifecycle to createVizDiagram (VIZ.JS),
   * provides Mermaid-specific load/build/filter callbacks.
   */
  function createDiagram(cfg) {
    var _ast    = null;
    var _legend = null;
    var _colors = null;

    createVizDiagram({
      modalId:              cfg.modalId,
      filterId:             cfg.filterId,
      ariaLabel:            cfg.ariaLabel,
      openGlobal:           cfg.openGlobal,
      closeGlobal:          cfg.closeGlobal,
      nodeActions:          cfg.nodeActions,
      nodeIgnoreSelector:   ".mm-node",
      hiddenClass:          "mm-hidden",
      startStatic:          true,
      minScale:             MIN_SCALE,
      maxScale:             MAX_SCALE,
      maxFitScale:          1,
      rubberBandDrag:       true,
      zoomStep:             [0.92, 1.08],
      fitPadding:           20,
      fitDuration:          1000,
      exploreStepDuration:  3000,

      load: function () {
        return fetch(cfg.mdFile + "?v=" + Date.now())
          .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
          .then(function (md) {
            var m = md.match(/```mermaid\s*\n([\s\S]*?)```/);
            if (!m) throw new Error("No mermaid block in " + cfg.mdFile);
            return m[1];
          });
      },

      build: function (source, world, svgLayer, ctx) {
        _ast    = parseMermaid(source);
        _legend = extractLegend(_ast);
        _colors = colorsFromAST(_ast.classDefs);

        var dims = buildDiagram(_ast, _colors, world, svgLayer, _legend.legendIds,
          function () { return ctx.isExploring(); });

        // Build filter list from legend
        var filters = [];
        var seen = new Set();
        _legend.legendNodes.forEach(function (ln) {
          if (!seen.has(ln.cls)) {
            seen.add(ln.cls);
            filters.push({ cls: ln.cls, label: ln.label, color: _colors[ln.cls] || "255,255,255" });
          }
        });

        return {
          svgW: dims.svgW,
          svgH: dims.svgH,
          nodeElements: dims.nodeElements,
          filters: filters,

          rebuild: function (activeClasses, ctx2) {
            var dynAST = filterAST(_ast, activeClasses);
            var d = buildDiagram(dynAST, _colors, world, svgLayer, _legend.legendIds,
              function () { return ctx2.isExploring(); });
            return { svgW: d.svgW, svgH: d.svgH, nodeElements: d.nodeElements };
          },

          applyFilter: function (activeClasses, ctx2) {
            return _mermaidStaticFilter(_ast, activeClasses, world, svgLayer, ctx2);
          },

          beforeExplore: function (w, svg) {
            w.querySelectorAll(".mm-node[data-mm-id]").forEach(function (el) { el.classList.add("mm-hidden"); });
            w.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(function (el) { el.classList.add("mm-hidden"); });
            svg.querySelectorAll(".mm-edge").forEach(function (el) { el.classList.add("mm-hidden"); });
            svg.querySelectorAll(".mm-edge-label-group").forEach(function (el) { el.classList.add("mm-hidden"); });
          },

          afterExplore: function (w, svg) {
            if (_mmGlowTimer) { clearTimeout(_mmGlowTimer); _mmGlowTimer = null; }
            w.classList.remove("mm-exploring", "mm-explore-hovering");
            w.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
            svg.querySelectorAll(".mm-explore-glow").forEach(function (el) { el.classList.remove("mm-explore-glow"); });
          },
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════
     7b. GENERIC SLOTTABLE OPEN — openMermaidModal(mdFile, opts?)
     Call with any .md file path; lazily creates + caches the instance.
     No per-diagram globals needed. DRY entry point for ad-hoc diagrams.
     ═════════════════════════════════════════════════════════════ */

  var _genericCache = {};

  /**
   * openMermaidModal(mdFile, opts?) — THE ONLY ENTRY POINT.
   *
   * Lazily creates + caches a diagram instance for any .md file.
   * No per-diagram globals, no hardcoded instances, no connector functions.
   * Driven entirely by the mdFile path passed from SETTINGS.json onclick.
   *
   * Node actions can be registered ahead of time via:
   *   window.__mermaidNodeActions = { 'ARCH.md': { NODE_ID: fn } };
   */
  window.openMermaidModal = function (mdFile, opts) {
    opts = opts || {};
    if (!_genericCache[mdFile]) {
      var slug = mdFile.replace(/[^a-zA-Z0-9]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").toLowerCase();
      var nodeActions = opts.nodeActions
        || (window.__mermaidNodeActions && window.__mermaidNodeActions[mdFile])
        || null;
      var cfg = {
        modalId:     "mm-" + slug,
        filterId:    "mm-" + slug + "-filters",
        mdFile:      mdFile,
        ariaLabel:   opts.ariaLabel || mdFile.replace(/.*\//, "").replace(/\.md$/i, "") + " diagram",
        openGlobal:  "_mm_open_" + slug,
        closeGlobal: "_mm_close_" + slug,
      };
      if (nodeActions) cfg.nodeActions = nodeActions;
      createDiagram(cfg);
      _genericCache[mdFile] = cfg;
    }
    var fn = window[_genericCache[mdFile].openGlobal];
    if (fn) fn();
  };

})();
