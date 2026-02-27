// ═══════════════════════════════════════════════════════════════
//  MERMAID DIAGRAM VIEWER — Reusable interactive flowchart engine
//
//  Factory function `createDiagram(cfg)` parses a Mermaid `graph TD`
//  block from any .md file and renders glassmorphic DOM tiles + SVG
//  arrows inside a pannable/zoomable viewport.  Instantiated once
//  for the Architecture modal and once for the MARP wiring modal.
//
//  Matches the knowledge-graph.js / timeline.js aesthetic.
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
     5. PAN & ZOOM  (delegates to shared initPanZoom in viz.js)
     ═════════════════════════════════════════════════════════════ */

  function _initPanZoom(viewport, state) {
    var pz = initPanZoom(viewport, state.world, state, {
      minScale: MIN_SCALE,
      maxScale: MAX_SCALE,
      getBounds: function () {
        if (!state._dims) return null;
        var vw = viewport.clientWidth, vh = viewport.clientHeight;
        var s = state.scale;
        var pad = 0.75;
        return {
          minX: vw * pad - state._dims.svgW * s,
          maxX: vw * (1 - pad),
          minY: vh * pad - state._dims.svgH * s,
          maxY: vh * (1 - pad),
        };
      },
      ignoreSelector: ".mm-node, .mm-explore-hint",
      rubberBandDrag: true,
      zoomStep: [0.92, 1.08],
      bounceCurve: "cubic-bezier(0.25, 1, 0.5, 1)",
      bounceDuration: 340,
    });
    state._update = pz.update;
  }

  /* ═════════════════════════════════════════════════════════════
     6. FILTER SYSTEM — rebuilds layout excluding hidden classes
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

  function buildFilters(pillContainer, legendNodes, colors, rebuild, onManualFilter) {
    if (!pillContainer || !legendNodes.length) return null;
    pillContainer.innerHTML = "";

    // Deduplicate by class name
    const seen = new Set();
    const filters = [];
    legendNodes.forEach(ln => {
      if (!seen.has(ln.cls)) { seen.add(ln.cls); filters.push(ln); }
    });

    const allClasses = filters.map(f => f.cls);
    const activeFilters = new Set(allClasses);

    // "All" button
    const allBtn = document.createElement("button");
    allBtn.className = "mm-filter active";
    allBtn.style.setProperty("--tc", "255,255,255");
    allBtn.innerHTML = '<span class="all-indicator">\u2b1c</span> \ud83c\udf9b\ufe0f';
    pillContainer.appendChild(allBtn);

    const themeBtns = [];
    filters.forEach(f => {
      const tc = colors[f.cls] || "255,255,255";
      const btn = document.createElement("button");
      btn.className = "mm-filter active";
      btn.dataset.filter = f.cls;
      btn.style.setProperty("--tc", tc);
      // Extract leading emoji from label, strip text
      var emojiMatch = f.label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)/u);
      var emojiOnly = emojiMatch ? emojiMatch[0] : '';
      btn.innerHTML = '<span class="mm-dot" style="background:rgba(' + tc + ',0.9);"></span> ' + emojiOnly;
      btn.title = f.label;
      pillContainer.appendChild(btn);
      themeBtns.push(btn);
    });

    function syncUI() {
      const allActive = activeFilters.size === allClasses.length;
      allBtn.classList.toggle("active", allActive);
      const isLight = document.documentElement.classList.contains("light-mode");
      const ind = allBtn.querySelector(".all-indicator");
      if (ind) ind.textContent = allActive ? (isLight ? "\u2b1b" : "\u2b1c") : (isLight ? "\u2b1c" : "\u2b1b");
      themeBtns.forEach(b => b.classList.toggle("active", activeFilters.has(b.dataset.filter)));
    }

    function doFilter() {
      syncUI();
      rebuild(activeFilters);
    }

    // Programmatic: set exactly one filter active
    function setOnly(cls) {
      activeFilters.clear();
      activeFilters.add(cls);
      doFilter();
    }
    // Programmatic: add one more filter
    function addFilter(cls) {
      activeFilters.add(cls);
      doFilter();
    }
    // Programmatic: activate all
    function setAll() {
      allClasses.forEach(c => activeFilters.add(c));
      doFilter();
    }
    // Programmatic: deactivate all (hide everything)
    function setNone() {
      activeFilters.clear();
      doFilter();
    }

    allBtn.addEventListener("click", () => {
      if (onManualFilter) onManualFilter();
      if (activeFilters.size === allClasses.length) return;
      setAll();
    });

    themeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
        if (onManualFilter) onManualFilter();
        const f = btn.dataset.filter;
        if (activeFilters.size === allClasses.length) {
          activeFilters.clear(); activeFilters.add(f);
        } else if (activeFilters.has(f) && activeFilters.size === 1) {
          allClasses.forEach(c => activeFilters.add(c));
        } else if (activeFilters.has(f)) {
          activeFilters.delete(f);
        } else {
          activeFilters.add(f);
        }
        doFilter();
      });
    });

    window.addEventListener("theme-changed", syncUI);

    // Build class→label map for explore hint
    const labelMap = {};
    filters.forEach(f => { labelMap[f.cls] = f.label; });

    return { allClasses: allClasses, labelMap: labelMap, setOnly: setOnly, addFilter: addFilter, setAll: setAll, setNone: setNone };
  }

  /* ═════════════════════════════════════════════════════════════
     7. FACTORY
     ═════════════════════════════════════════════════════════════ */

  function createDiagram(cfg) {
    const modal = document.getElementById(cfg.modalId);
    if (!modal) return;

    const state = { built: false, x: 0, y: 0, scale: 1, world: null, _update: null };
    let _svgLayer = null, _dims = null;
    let _ast = null, _legend = null, _colors = null;
    let _visibleBounds = null;  // { x, y, w, h } of visible content
    let _fitHandle = null;      // current animateCameraFit handle

    function fitView(animate) {
      const vp = modal.querySelector(".mm-viewport");
      if (!vp || !state.world || !_dims) return;
      const bw = _visibleBounds ? _visibleBounds.w : _dims.svgW;
      const bh = _visibleBounds ? _visibleBounds.h : _dims.svgH;
      const bx = _visibleBounds ? _visibleBounds.x : 0;
      const by = _visibleBounds ? _visibleBounds.y : 0;

      // Cancel any in-flight animation
      if (_fitHandle) { _fitHandle.cancel(); _fitHandle = null; }
      state.world.style.transition = "";

      _fitHandle = animateCameraFit(state, function () {
        if (state._update) state._update();
      }, {
        vpWidth:  vp.clientWidth,
        vpHeight: vp.clientHeight,
        bounds:   { x: bx, y: by, w: bw, h: bh },
        minScale: MIN_SCALE,
        maxScale: 1,     // never zoom past 1× for diagram fit
        padding:  20,
        duration: 1000,
        animate:  animate,
      });
    }

    function rebuild(activeClasses) {
      if (!_ast || !_svgLayer) return;

      var isDynamic = _layoutToggle && !_layoutToggle.isStatic();

      // ── DYNAMIC MODE: full re-render with filtered AST ─────
      if (isDynamic) {
        var dynAST = filterAST(_ast, activeClasses);
        _dims = buildDiagram(dynAST, _colors, state.world, _svgLayer, _legend.legendIds, function() { return _exploring; });
        state._dims = _dims;
        _visibleBounds = null; // fit full re-rendered diagram
        requestAnimationFrame(function () { fitView(true); });
        return;
      }

      // ── STATIC MODE: toggle visibility classes ─────────────

      // Snapshot currently visible elements BEFORE toggling
      const prevVisibleNodes = new Set();
      const prevVisibleSgs   = new Set();
      const prevVisibleEdges = new Set();
      state.world.querySelectorAll(".mm-node[data-mm-id]:not(.mm-hidden)").forEach(el => {
        prevVisibleNodes.add(el.dataset.mmId);
      });
      state.world.querySelectorAll(".mm-subgraph[data-mm-sg]:not(.mm-hidden)").forEach(el => {
        prevVisibleSgs.add(el.dataset.mmSg);
      });
      _svgLayer.querySelectorAll(".mm-edge[data-mm-from]:not(.mm-hidden)").forEach(el => {
        prevVisibleEdges.add(el.dataset.mmFrom + "->" + el.dataset.mmTo);
      });

      // Determine which nodes & subgraphs survive the filter
      const filtered = filterAST(_ast, activeClasses);
      const liveNodes = new Set(Object.keys(filtered.nodes));
      const liveSgs   = new Set(filtered.subgraphs.map(sg => sg.id));
      const liveEdgeKeys = new Set(filtered.edges.map(e => e.from + "->" + e.to));

      // Toggle nodes
      state.world.querySelectorAll(".mm-node[data-mm-id]").forEach(el => {
        el.classList.toggle("mm-hidden", !liveNodes.has(el.dataset.mmId));
      });

      // Toggle subgraphs
      state.world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(el => {
        el.classList.toggle("mm-hidden", !liveSgs.has(el.dataset.mmSg));
      });

      // Toggle edges + their labels
      _svgLayer.querySelectorAll(".mm-edge[data-mm-from]").forEach(el => {
        el.classList.toggle("mm-hidden", !liveEdgeKeys.has(el.dataset.mmFrom + "->" + el.dataset.mmTo));
      });
      _svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]").forEach(el => {
        el.classList.toggle("mm-hidden", !liveEdgeKeys.has(el.dataset.mmFrom + "->" + el.dataset.mmTo));
      });

      // ── Dim neighbour nodes/edges (visible but not primary) ─
      const allActive = activeClasses.size >= Object.keys(_ast.classDefs).length;
      // Build set of primary node IDs: nodes whose class is in the active set
      const primaryNodeIds = new Set();
      if (!allActive) {
        Object.keys(filtered.nodes).forEach(id => {
          const cls = _ast.classAssigns[id] || (_ast.nodes[id] && _ast.nodes[id].classes && _ast.nodes[id].classes[0]) || "";
          if (!cls || cls === "footer" || activeClasses.has(cls)) primaryNodeIds.add(id);
        });
      }
      // Also identify primary subgraph IDs (subgraphs whose inferred class is in keep)
      const primarySgIds = new Set();
      if (!allActive) {
        const sgMap = new Map(); _ast.subgraphs.forEach(s => sgMap.set(s.id, s));
        filtered.subgraphs.forEach(sg => {
          const cls = inferSubgraphClass(sg.id, _ast);
          if (cls && activeClasses.has(cls)) {
            // Single-class subgraph with that class active → primary
            primarySgIds.add(sg.id);
          } else if (!cls) {
            // Mixed or classless subgraph: primary if ANY descendant class is active
            const s = sgMap.get(sg.id);
            if (s) {
              let hasActive = false;
              (function walkSg(sub) {
                (sub.children || []).forEach(cid => {
                  const c = _ast.classAssigns[cid] || (_ast.nodes[cid] && _ast.nodes[cid].classes && _ast.nodes[cid].classes[0]) || "";
                  if (c && activeClasses.has(c)) hasActive = true;
                });
                (sub.childSubgraphs || []).forEach(csid => { const ch = sgMap.get(csid); if (ch) walkSg(ch); });
              })(s);
              if (hasActive) primarySgIds.add(sg.id);
            }
          }
        });
      }

      state.world.querySelectorAll(".mm-node[data-mm-id]").forEach(el => {
        el.classList.toggle("mm-neighbour", !allActive && liveNodes.has(el.dataset.mmId) && !primaryNodeIds.has(el.dataset.mmId));
      });
      state.world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(el => {
        el.classList.toggle("mm-neighbour", !allActive && liveSgs.has(el.dataset.mmSg) && !primarySgIds.has(el.dataset.mmSg));
      });
      // Edges: dim if NEITHER endpoint is a primary node/subgraph
      _svgLayer.querySelectorAll(".mm-edge[data-mm-from]").forEach(el => {
        const fromPrimary = primaryNodeIds.has(el.dataset.mmFrom) || primarySgIds.has(el.dataset.mmFrom);
        const toPrimary   = primaryNodeIds.has(el.dataset.mmTo)   || primarySgIds.has(el.dataset.mmTo);
        el.classList.toggle("mm-neighbour", !allActive && !el.classList.contains("mm-hidden") && !fromPrimary && !toPrimary);
      });
      _svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]").forEach(el => {
        const fromPrimary = primaryNodeIds.has(el.dataset.mmFrom) || primarySgIds.has(el.dataset.mmFrom);
        const toPrimary   = primaryNodeIds.has(el.dataset.mmTo)   || primarySgIds.has(el.dataset.mmTo);
        el.classList.toggle("mm-neighbour", !allActive && !el.classList.contains("mm-hidden") && !fromPrimary && !toPrimary);
      });

      // ── Glow newly-revealed elements during explore tour ───
      if (_exploring) {
        // Clear any prior explore highlights
        state.world.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
        _svgLayer.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
        state.world.classList.add("mm-explore-hovering");

        // Highlight newly visible PRIMARY nodes only (skip neighbours)
        state.world.querySelectorAll(".mm-node[data-mm-id]:not(.mm-hidden):not(.mm-neighbour)").forEach(el => {
          if (!prevVisibleNodes.has(el.dataset.mmId)) {
            el.classList.add("mm-explore-glow");
          }
        });
        // Highlight newly visible PRIMARY subgraphs only
        state.world.querySelectorAll(".mm-subgraph[data-mm-sg]:not(.mm-hidden):not(.mm-neighbour)").forEach(el => {
          if (!prevVisibleSgs.has(el.dataset.mmSg)) {
            el.classList.add("mm-explore-glow");
          }
        });
        // Highlight newly visible edges only if at least one endpoint is primary
        _svgLayer.querySelectorAll(".mm-edge[data-mm-from]:not(.mm-hidden):not(.mm-neighbour)").forEach(el => {
          const key = el.dataset.mmFrom + "->" + el.dataset.mmTo;
          if (!prevVisibleEdges.has(key)) {
            el.classList.add("mm-explore-glow");
          }
        });
        _svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]:not(.mm-hidden):not(.mm-neighbour)").forEach(el => {
          const key = el.dataset.mmFrom + "->" + el.dataset.mmTo;
          if (!prevVisibleEdges.has(key)) {
            el.classList.add("mm-explore-glow");
          }
        });

        // Fade out glow after current step duration
        if (_exploreGlowTimer) clearTimeout(_exploreGlowTimer);
        _exploreGlowTimer = setTimeout(function () {
          state.world.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
          _svgLayer.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
          state.world.classList.remove("mm-explore-hovering");
        }, _exploreStepDuration);
      }

      // Compute bounding box for camera fit
      // During explore: frame only the glowing (newly revealed) elements
      // Otherwise: frame primary (non-neighbour) visible elements
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      const glowSuffix = _exploring ? ".mm-explore-glow" : ":not(.mm-neighbour)";
      const nodeSel = ".mm-node[data-mm-id]:not(.mm-hidden)" + glowSuffix;
      const sgSel   = ".mm-subgraph[data-mm-sg]:not(.mm-hidden)" + glowSuffix;
      function accumBounds(el) {
        const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
        const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      }
      state.world.querySelectorAll(nodeSel).forEach(accumBounds);
      state.world.querySelectorAll(sgSel).forEach(accumBounds);

      // During explore, also include glowing edges (SVG paths) in bounding box
      if (_exploring) {
        _svgLayer.querySelectorAll(".mm-edge.mm-explore-glow").forEach(function (pathEl) {
          try {
            var bb = pathEl.getBBox();
            if (bb.width > 0 || bb.height > 0) {
              if (bb.x < minX) minX = bb.x;
              if (bb.y < minY) minY = bb.y;
              if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
              if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
            }
          } catch (e) { /* getBBox can throw if element is not rendered */ }
        });
        _svgLayer.querySelectorAll(".mm-edge-label-group.mm-explore-glow").forEach(function (g) {
          try {
            var bb = g.getBBox();
            if (bb.width > 0 || bb.height > 0) {
              if (bb.x < minX) minX = bb.x;
              if (bb.y < minY) minY = bb.y;
              if (bb.x + bb.width > maxX) maxX = bb.x + bb.width;
              if (bb.y + bb.height > maxY) maxY = bb.y + bb.height;
            }
          } catch (e) {}
        });
      }

      if (minX < Infinity) {
        const pad = 20;
        _visibleBounds = { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 };
      } else {
        _visibleBounds = null;  // fallback to full diagram
      }

      requestAnimationFrame(() => fitView(true));
    }

    function load() {
      if (state.built) return;
      fetch(cfg.mdFile + "?v=" + Date.now())
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(md => {
          const m = md.match(/```mermaid\s*\n([\s\S]*?)```/);
          if (!m) { console.warn("[mermaid-view] No mermaid block in", cfg.mdFile); return; }
          _ast = parseMermaid(m[1]);
          _legend = extractLegend(_ast);
          _colors = colorsFromAST(_ast.classDefs);
          _dims = buildDiagram(_ast, _colors, state.world, _svgLayer, _legend.legendIds, function() { return _exploring; });
          state._dims = _dims;
          state.built = true;

          // Build filter pills from legend
          const pillContainer = document.getElementById(cfg.filterId);
          if (pillContainer && _legend.legendNodes.length) {
            _filterAPI = buildFilters(pillContainer, _legend.legendNodes, _colors, rebuild, function() { stopExplore(false); });

            // Add layout toggle as leftmost button (before All)
            var toggleBtn = document.createElement("button");
            toggleBtn.className = "kg-layout-toggle";
            toggleBtn.title = "Static: nodes keep their positions when filtering. Dynamic: nodes reflow into compact positions.";
            pillContainer.insertBefore(toggleBtn, pillContainer.firstChild);
            _layoutToggle = createLayoutToggle({
              btn: toggleBtn,
              onDynamic: function () { _filterAPI.setAll(); },
              onStatic: function () {
                // Rebuild full diagram so all positions are restored
                _dims = buildDiagram(_ast, _colors, state.world, _svgLayer, _legend.legendIds, function() { return _exploring; });
                state._dims = _dims;
                _visibleBounds = null;
                requestAnimationFrame(function () { fitView(true); });
              },
              startStatic: true,
            });
          }

          requestAnimationFrame(() => fitView(false));
        })
        .catch(err => console.error("[mermaid-view]", cfg.mdFile, err));
    }

    // ── Auto-explore tour ────────────────────────────────────
    let _filterAPI = null;
    let _layoutToggle = null;
    let _exploreTimers = [];
    let _exploring = false;
    let _exploreGlowTimer = null;
    let _exploreGen = 0;  // generation counter to invalidate stale timers
    let _exploreStepDuration = 3000; // current step's duration (updated per step)

    var EXPLORE_DEFAULT = '<strong>Explore</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';
    var _hintCF = createCrossfader();

    function resetHintLabel() {
      var hint = modal.querySelector(".mm-explore-hint");
      if (!hint) return;
      if (_exploring) {
        _hintCF.fade(hint, EXPLORE_DEFAULT, function () { hint.classList.remove("exploring"); });
      } else {
        hint.innerHTML = EXPLORE_DEFAULT;
        hint.classList.remove("exploring");
      }
    }

    function setHintLabel(label) {
      var hint = modal.querySelector(".mm-explore-hint");
      if (!hint) return;
      var m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
      var emoji = m ? m[1] : '\uD83D\uDD2D';
      var text  = m ? label.slice(m[0].length) : label;
      var html = '<strong>' + text + '</strong><span class="scroll-arrow">' + emoji + '</span>';
      _hintCF.fade(hint, html);
    }

    function stopExplore(restoreAll) {
      _exploreGen++;
      _exploreTimers.forEach(t => clearTimeout(t));
      _exploreTimers = [];
      _exploring = false;
      if (_exploreGlowTimer) { clearTimeout(_exploreGlowTimer); _exploreGlowTimer = null; }
      // Clear any lingering explore glow
      if (state.world) {
        state.world.classList.remove("mm-exploring");
        state.world.classList.remove("mm-explore-hovering");
        state.world.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
      }
      if (_svgLayer) {
        _svgLayer.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
      }
      // Clear pill glow
      var pills = document.getElementById(cfg.filterId);
      if (pills) pills.querySelectorAll(".mm-filter-glow").forEach(function (el) { el.classList.remove("mm-filter-glow"); });
      resetHintLabel();
      // Only restore all filters when explicitly requested (e.g. tour end, close)
      // Not when a user manually clicks a filter pill
      if (restoreAll !== false && _filterAPI) _filterAPI.setAll();
    }

    function startExplore() {
      if (!_filterAPI) return;

      // If already exploring, cancel and reset
      if (_exploring) {
        stopExplore();
        return;
      }

      _exploreGen++;
      var gen = _exploreGen;
      _exploring = true;
      if (state.world) state.world.classList.add("mm-exploring");
      var hint = modal.querySelector(".mm-explore-hint");
      if (hint) hint.classList.add("exploring");
      var classes = _filterAPI.allClasses;
      var labels = _filterAPI.labelMap;

      // Constant step duration (ms)
      var stepDuration = 3000;
      var stepDurations = [];
      for (var fi = 0; fi < classes.length + 1; fi++) {
        stepDurations.push(stepDuration);
      }
      // Cumulative times for setTimeout scheduling
      var cumulative = [0];
      for (var ci = 0; ci < stepDurations.length; ci++) {
        cumulative.push(cumulative[ci] + stepDurations[ci]);
      }

      // Glow the filter pill for the current explore step
      var pillContainer = document.getElementById(cfg.filterId);
      function glowFilterPill(cls) {
        if (!pillContainer) return;
        // Remove prior pill glow
        pillContainer.querySelectorAll(".mm-filter-glow").forEach(function (el) { el.classList.remove("mm-filter-glow"); });
        // Add glow to matching pill
        var pill = pillContainer.querySelector('.mm-filter[data-filter="' + cls + '"]');
        if (pill) pill.classList.add("mm-filter-glow");
      }

      // Start with first category only
      // First, hide everything so the glow diff treats all first-step
      // elements as "newly revealed" (matching subsequent steps).
      state.world.querySelectorAll(".mm-node[data-mm-id]").forEach(function (el) { el.classList.add("mm-hidden"); });
      state.world.querySelectorAll(".mm-subgraph[data-mm-sg]").forEach(function (el) { el.classList.add("mm-hidden"); });
      _svgLayer.querySelectorAll(".mm-edge").forEach(function (el) { el.classList.add("mm-hidden"); });
      _svgLayer.querySelectorAll(".mm-edge-label-group").forEach(function (el) { el.classList.add("mm-hidden"); });
      _exploreStepDuration = stepDurations[0];
      _filterAPI.setOnly(classes[0]);
      setHintLabel(labels[classes[0]] || classes[0]);
      glowFilterPill(classes[0]);

      // Add each subsequent category one at a time
      for (var i = 1; i < classes.length; i++) {
        (function (idx) {
          _exploreTimers.push(setTimeout(function () {
            if (!_exploring || gen !== _exploreGen) return;
            _exploreStepDuration = stepDurations[idx];
            _filterAPI.addFilter(classes[idx]);
            setHintLabel(labels[classes[idx]] || classes[idx]);
            glowFilterPill(classes[idx]);
          }, cumulative[idx]));
        })(i);
      }

      // Final: show all and reset hint to Explore
      _exploreTimers.push(setTimeout(function () {
        if (!_exploring || gen !== _exploreGen) return;
        _filterAPI.setAll();
        _exploring = false;
        if (state.world) state.world.classList.remove("mm-exploring");
        // Clear pill glow
        if (pillContainer) pillContainer.querySelectorAll(".mm-filter-glow").forEach(function (el) { el.classList.remove("mm-filter-glow"); });
        resetHintLabel();
      }, cumulative[classes.length]));
    }

    function open() {
      toggleModal(modal, true);
      if (!state.built) load(); else requestAnimationFrame(() => fitView(false));
    }
    function close() { stopExplore(); toggleModal(modal, false); }

    // Wire DOM
    const vp = modal.querySelector(".mm-viewport");
    if (vp) {
      state.world = modal.querySelector(".mm-world");
      _svgLayer   = modal.querySelector(".mm-edges");
      if (state.world && _svgLayer) _initPanZoom(vp, state);
    }

    const closeBtn = document.getElementById(cfg.closeId);
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modal.classList.contains("open")) close();
    });

    // ── Explore hint ─────────────────────────────────────────
    if (vp) {
      const hint = document.createElement("div");
      hint.className = "mm-explore-hint scroll-hint";
      hint.innerHTML = '<strong>Explore</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';
      hint.style.cursor = "pointer";
      hint.addEventListener("click", function (e) {
        e.preventDefault();
        startExplore();
      });
      // Also stop explore on user pan/zoom interaction
      vp.addEventListener("pointerdown", function (e) { if (_exploring && !e.target.closest(".mm-explore-hint")) stopExplore(); });
      vp.addEventListener("wheel", function () { if (_exploring) stopExplore(); }, { passive: true });
      vp.appendChild(hint);
    }

    window[cfg.openGlobal]  = open;
    window[cfg.closeGlobal] = close;
  }

  /* ═════════════════════════════════════════════════════════════
     8. INSTANCES
     ═════════════════════════════════════════════════════════════ */

  // ── Site Architecture ──────────────────────────────────────
  createDiagram({
    modalId:     "arch-modal",
    closeId:     "archModalClose",
    filterId:    "arch-filters",
    mdFile:      "architecture.md",
    openGlobal:  "openArchModal",
    closeGlobal: "closeArchModal",
  });

  // ── MARP Wiring Diagram ────────────────────────────────────
  createDiagram({
    modalId:     "marp-modal",
    closeId:     "marpModalClose",
    filterId:    "marp-filters",
    mdFile:      "marp-architecture.md",
    openGlobal:  "openMarpModal",
    closeGlobal: "closeMarpModal",
  });

})();
