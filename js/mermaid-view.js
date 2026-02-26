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
  const NODE_W = 140;
  const NODE_H = 58;
  const NODE_GAP_X = 20;
  const NODE_GAP_Y = 20;
  const SUBGRAPH_PAD = 16;
  const SUBGRAPH_HEADER = 32;
  const SECTION_GAP = 28;
  const MIN_SCALE = 0.25;
  const MAX_SCALE = 3;

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
          direction: "TB", children: [], childSubgraphs: [],
          parent: subgraphStack.length ? subgraphStack[subgraphStack.length - 1].id : null,
        };
        if (subgraphStack.length) subgraphStack[subgraphStack.length - 1].childSubgraphs.push(sg.id);
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
      const nodeMatch = line.match(/^(\w+)\s*\["(.*)"\]\s*(?:::(\w+))?\s*$/);
      if (nodeMatch) {
        const id = nodeMatch[1], rawLabel = nodeMatch[2], inlineCls = nodeMatch[3] || null;
        const parts = rawLabel.split("\\n");
        const titlePart = parts[0].replace(/<[^>]+>/g, "").trim();
        const subtitleParts = parts.slice(1).map(p => {
          const iMatch = p.match(/<i>(.*?)<\/i>/);
          return iMatch ? iMatch[1].trim() : p.replace(/<[^>]+>/g, "").trim();
        }).filter(Boolean);
        nodes[id] = { id, label: titlePart, subtitle: subtitleParts.join(" · "), htmlLabel: rawLabel, classes: inlineCls ? [inlineCls] : [] };
        if (subgraphStack.length) subgraphStack[subgraphStack.length - 1].children.push(id);
        if (inlineCls) classAssigns[id] = inlineCls;
        continue;
      }

      // Bare node reference
      const bareMatch = line.match(/^(\w+)\s*$/);
      if (bareMatch && subgraphStack.length) {
        const id = bareMatch[1];
        if (nodes[id]) subgraphStack[subgraphStack.length - 1].children.push(id);
      }
    }

    Object.keys(classAssigns).forEach(id => {
      if (nodes[id] && !nodes[id].classes.includes(classAssigns[id])) nodes[id].classes.push(classAssigns[id]);
    });

    return { title, nodes, edges, subgraphs, classDefs, classAssigns };
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
    function walkLegend(sg) {
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
      (sg.childSubgraphs || []).forEach(cid => {
        const ch = ast.subgraphs.find(s => s.id === cid);
        if (ch) walkLegend(ch);
      });
    }
    ast.subgraphs.filter(sg => sg.id === "Legend").forEach(walkLegend);
    return { legendNodes, legendIds, legendNodeIds };
  }

  /* ═════════════════════════════════════════════════════════════
     3. LAYOUT ENGINE
     ═════════════════════════════════════════════════════════════ */

  function collectAllNodes(sg, sgMap, set) {
    (sg.children || []).forEach(id => set.add(id));
    (sg.childSubgraphs || []).forEach(id => {
      const child = sgMap.get(id);
      if (child) collectAllNodes(child, sgMap, set);
    });
  }

  function layoutSubgraph(sg, ast, sgMap) {
    const dir = sg.direction || "TB";
    const isHoriz = dir === "LR" || dir === "RL";
    const childSGs = (sg.childSubgraphs || []).map(id => sgMap.get(id)).filter(Boolean);
    const childSGNodeIds = new Set();
    childSGs.forEach(csg => collectAllNodes(csg, sgMap, childSGNodeIds));
    const directNodes = (sg.children || []).filter(id => !childSGNodeIds.has(id) && ast.nodes[id]);
    const childLayouts = childSGs.map(csg => ({ sg: csg, layout: layoutSubgraph(csg, ast, sgMap) }));
    const positions = new Map();
    let contentW = 0, contentH = 0;

    if (isHoriz) {
      const cy = SUBGRAPH_PAD + SUBGRAPH_HEADER;
      const maxPerRow = childLayouts.length > 3 ? 2 : childLayouts.length;
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
      if (childLayouts.length) {
        const hasLRChildren = childLayouts.some(cl => cl.sg.direction === "LR");
        if (hasLRChildren || childLayouts.length <= 2) {
          let cx = SUBGRAPH_PAD, rowH = 0;
          childLayouts.forEach(({ sg: csg, layout }) => {
            csg._layoutX = cx; csg._layoutY = cy;
            csg._layoutW = layout.w; csg._layoutH = layout.h;
            layout.nodePositions.forEach((pos, id) => { positions.set(id, { x: cx + pos.x, y: cy + pos.y }); });
            cx += layout.w + NODE_GAP_X;
            rowH = Math.max(rowH, layout.h);
          });
          maxW = Math.max(maxW, cx - NODE_GAP_X + SUBGRAPH_PAD);
          cy += rowH + NODE_GAP_Y;
        } else {
          childLayouts.forEach(({ sg: csg, layout }) => {
            csg._layoutX = SUBGRAPH_PAD; csg._layoutY = cy;
            csg._layoutW = layout.w; csg._layoutH = layout.h;
            layout.nodePositions.forEach((pos, id) => { positions.set(id, { x: SUBGRAPH_PAD + pos.x, y: cy + pos.y }); });
            maxW = Math.max(maxW, layout.w + SUBGRAPH_PAD * 2);
            cy += layout.h + NODE_GAP_Y;
          });
        }
      }
      if (directNodes.length) {
        const cols = Math.min(3, directNodes.length);
        const rows = Math.ceil(directNodes.length / cols);
        const gridW = cols * NODE_W + (cols - 1) * NODE_GAP_X;
        const startX = SUBGRAPH_PAD + (Math.max(maxW, gridW + SUBGRAPH_PAD * 2) - gridW) / 2 - SUBGRAPH_PAD;
        directNodes.forEach((nodeId, idx) => {
          const col = idx % cols, row = Math.floor(idx / cols);
          positions.set(nodeId, {
            x: Math.max(SUBGRAPH_PAD, startX) + col * (NODE_W + NODE_GAP_X) + NODE_W / 2,
            y: cy + row * (NODE_H + NODE_GAP_Y) + NODE_H / 2,
          });
        });
        maxW = Math.max(maxW, gridW + SUBGRAPH_PAD * 2);
        cy += rows * NODE_H + (rows - 1) * NODE_GAP_Y + NODE_GAP_Y;
      }
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

  function buildDiagram(ast, colors, world, svgLayer, legendIds) {
    world.innerHTML = "";
    svgLayer.innerHTML = "";
    world.appendChild(svgLayer);

    const sgMap = new Map();
    ast.subgraphs.forEach(sg => sgMap.set(sg.id, sg));
    // Skip Legend subgraphs from layout
    const topLevel = ast.subgraphs.filter(sg => !sg.parent && !legendIds.has(sg.id));
    const topLayouts = topLevel.map(sg => ({ sg, layout: layoutSubgraph(sg, ast, sgMap) }));

    let maxW = 0;
    topLayouts.forEach(tl => { maxW = Math.max(maxW, tl.layout.w); });

    const globalPositions = new Map();
    let offsetY = SECTION_GAP;
    topLayouts.forEach(tl => {
      const xOff = (maxW - tl.layout.w) / 2;
      tl.sg._globalX = xOff; tl.sg._globalY = offsetY;
      tl.sg._globalW = tl.layout.w; tl.sg._globalH = tl.layout.h;
      tl.layout.nodePositions.forEach((pos, id) => {
        globalPositions.set(id, { x: xOff + pos.x, y: offsetY + pos.y });
      });
      offsetY += tl.layout.h + SECTION_GAP;
    });
    const totalH = offsetY;

    // ── Subgraph containers ──────────────────────────────────
    function renderSubgraph(sg, parentX, parentY) {
      const gx = sg._globalX !== undefined ? sg._globalX : (sg._layoutX || 0) + parentX;
      const gy = sg._globalY !== undefined ? sg._globalY : (sg._layoutY || 0) + parentY;
      const gw = sg._globalW !== undefined ? sg._globalW : sg._layoutW || 200;
      const gh = sg._globalH !== undefined ? sg._globalH : sg._layoutH || 100;
      const isInvisible = !sg.label || sg.label.trim() === "" || sg.label === sg.id;
      const c = document.createElement("div");
      c.className = "mm-subgraph" + (isInvisible ? " mm-subgraph-invisible" : "");
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
    function collectSgBounds(sg, px, py) {
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
        sEl.className = "mm-node-subtitle";
        sEl.textContent = node.subtitle;
        el.appendChild(sEl);
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
    const edgeElements = [];
    let edgeCount = 0;
    ast.edges.forEach(edge => {
      let fromPt = nodeElements[edge.from], toPt = nodeElements[edge.to];
      let fromSg = null, toSg = null;
      if (!fromPt && sgBounds.has(edge.from)) { const b = sgBounds.get(edge.from); fromPt = { x: b.cx, y: b.cy, cls: "" }; fromSg = b; }
      if (!toPt && sgBounds.has(edge.to))     { const b = sgBounds.get(edge.to);   toPt   = { x: b.cx, y: b.cy, cls: "" }; toSg   = b; }
      if (!fromPt || !toPt) return;

      // Determine edge color from source node's class
      const edgeCls = fromPt.cls || toPt.cls || "";
      const edgeTC = colors[edgeCls] || "255,255,255";

      const fHH = fromSg ? fromSg.h / 2 : NODE_H / 2;
      const tHH = toSg   ? toSg.h / 2   : NODE_H / 2;

      // Always: exit bottom-center of source, enter top-center of target
      let x1 = fromPt.x, y1 = fromPt.y + fHH;
      let x2 = toPt.x,   y2 = toPt.y - tHH;

      const path = document.createElementNS(svgNS, "path");
      const gap = y2 - y1;
      if (gap > 0) {
        // Normal downward flow — smooth vertical bezier
        const cy = Math.max(gap * 0.45, 30);
        path.setAttribute("d", "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 + cy) + " " + x2 + "," + (y2 - cy) + " " + x2 + "," + y2);
      } else {
        // Target is above or same row — S-curve looping down then back up
        const loopOut = 60;
        const midX = (x1 + x2) / 2;
        path.setAttribute("d", "M" + x1 + "," + y1 + " C" + x1 + "," + (y1 + loopOut) + " " + midX + "," + (y1 + loopOut) + " " + midX + "," + ((y1 + y2) / 2) + " S" + x2 + "," + (y2 - loopOut) + " " + x2 + "," + y2);
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
      svgLayer.appendChild(path);

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
        const labelLines = edge.label.split("\n");
        const lh = 12, totalLH = labelLines.length * lh;
        const maxLen = Math.max(...labelLines.map(l => l.length));
        const bw = maxLen * 7 + 16, bh = totalLH + 8;
        const bg = document.createElementNS(svgNS, "rect");
        bg.setAttribute("x", lx - bw / 2); bg.setAttribute("y", ly - bh / 2);
        bg.setAttribute("width", bw); bg.setAttribute("height", bh);
        bg.setAttribute("rx", "6"); bg.setAttribute("fill", "rgba(15,15,20,0.8)");
        bg.setAttribute("stroke", "rgba(255,255,255,0.15)"); bg.setAttribute("stroke-width", "0.5");
        g.appendChild(bg);
        labelLines.forEach((ln, i) => {
          const t = document.createElementNS(svgNS, "text");
          t.setAttribute("x", lx); t.setAttribute("y", ly - totalLH / 2 + i * lh + lh - 2);
          t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", "rgba(255,255,255,0.8)");
          t.setAttribute("font-size", "10"); t.setAttribute("font-family", "system-ui, sans-serif");
          t.setAttribute("font-weight", "600"); t.textContent = ln;
          g.appendChild(t);
        });
        svgLayer.appendChild(g);
        labelGroup = g;
      }
      edgeElements.push({ path, labelGroup, classes: edgeClasses });
      edgeCount++;
    });

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

    return { svgW, svgH, nodeElements, edgeElements };
  }

  /* ═════════════════════════════════════════════════════════════
     5. PAN & ZOOM
     ═════════════════════════════════════════════════════════════ */

  function initPanZoom(viewport, state) {
    let isPanning = false, startX = 0, startY = 0, startTX = 0, startTY = 0;

    function update() {
      if (!state.world) return;
      state.world.style.transform = "translate(" + state.x + "px, " + state.y + "px) scale(" + state.scale + ")";
    }
    state._update = update;

    viewport.addEventListener("pointerdown", e => {
      if (e.target.closest(".mm-node")) return;
      isPanning = true; startX = e.clientX; startY = e.clientY;
      startTX = state.x; startTY = state.y;
      viewport.style.cursor = "grabbing"; viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", e => {
      if (!isPanning) return;
      state.x = startTX + (e.clientX - startX); state.y = startTY + (e.clientY - startY); update();
    });
    viewport.addEventListener("pointerup", () => { isPanning = false; viewport.style.cursor = "grab"; });
    viewport.addEventListener("pointercancel", () => { isPanning = false; viewport.style.cursor = "grab"; });

    viewport.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const prev = state.scale;
      state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * (e.deltaY > 0 ? 0.92 : 1.08)));
      const ratio = state.scale / prev;
      state.x = mx - ratio * (mx - state.x); state.y = my - ratio * (my - state.y); update();
    }, { passive: false });

    let lastDist = 0;
    viewport.addEventListener("touchstart", e => {
      if (e.touches.length === 2) {
        const dx2 = e.touches[1].clientX - e.touches[0].clientX;
        const dy2 = e.touches[1].clientY - e.touches[0].clientY;
        lastDist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
      }
    }, { passive: true });
    viewport.addEventListener("touchmove", e => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const dx2 = e.touches[1].clientX - e.touches[0].clientX;
        const dy2 = e.touches[1].clientY - e.touches[0].clientY;
        const dist = Math.sqrt(dx2 * dx2 + dy2 * dy2);
        if (lastDist > 0) {
          const rect = viewport.getBoundingClientRect();
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left;
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top;
          const prev = state.scale;
          state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * (dist / lastDist)));
          const ratio = state.scale / prev;
          state.x = cx - ratio * (cx - state.x); state.y = cy - ratio * (cy - state.y); update();
        }
        lastDist = dist;
      }
    }, { passive: false });
  }

  /* ═════════════════════════════════════════════════════════════
     6. FILTER SYSTEM
     ═════════════════════════════════════════════════════════════ */

  function buildFilters(pillContainer, legendNodes, colors, nodeElements, edgeElements) {
    if (!pillContainer || !legendNodes.length) return;
    pillContainer.innerHTML = "";

    // Deduplicate by class name
    const seen = new Set();
    const filters = [];
    legendNodes.forEach(ln => {
      if (!seen.has(ln.cls)) { seen.add(ln.cls); filters.push(ln); }
    });

    const allClasses = filters.map(f => f.cls);
    const activeFilters = new Set(allClasses);

    function applyFilter() {
      const allActive = activeFilters.size === allClasses.length;
      Object.values(nodeElements).forEach(n => {
        if (!n.cls) return;
        n.el.classList.toggle("mm-hidden", !allActive && !activeFilters.has(n.cls));
      });
      edgeElements.forEach(e => {
        const hide = !allActive && [...e.classes].some(c => !activeFilters.has(c));
        e.path.classList.toggle("mm-hidden", hide);
        if (e.labelGroup) e.labelGroup.classList.toggle("mm-hidden", hide);
      });
    }

    // "All" button
    const allBtn = document.createElement("button");
    allBtn.className = "mm-filter active";
    allBtn.style.setProperty("--tc", "255,255,255");
    allBtn.innerHTML = '<span class="all-indicator">\u2b1c</span> \ud83c\udf9b\ufe0f All';
    pillContainer.appendChild(allBtn);

    const themeBtns = [];
    filters.forEach(f => {
      const tc = colors[f.cls] || "255,255,255";
      const btn = document.createElement("button");
      btn.className = "mm-filter active";
      btn.dataset.filter = f.cls;
      btn.style.setProperty("--tc", tc);
      btn.innerHTML = '<span class="mm-dot" style="background:rgba(' + tc + ',0.9);"></span> ' + f.label;
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

    allBtn.addEventListener("click", () => {
      if (activeFilters.size === allClasses.length) return;
      allClasses.forEach(c => activeFilters.add(c));
      syncUI(); applyFilter();
    });

    themeBtns.forEach(btn => {
      btn.addEventListener("click", () => {
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
        syncUI(); applyFilter();
      });
    });

    window.addEventListener("theme-changed", syncUI);
  }

  /* ═════════════════════════════════════════════════════════════
     7. FACTORY
     ═════════════════════════════════════════════════════════════ */

  function createDiagram(cfg) {
    const modal = document.getElementById(cfg.modalId);
    if (!modal) return;

    const state = { built: false, x: 0, y: 0, scale: 1, world: null, _update: null };
    let _svgLayer = null, _dims = null;

    function fitView() {
      const vp = modal.querySelector(".mm-viewport");
      if (!vp || !state.world || !_dims) return;
      const vw = vp.clientWidth, vh = vp.clientHeight;
      const sx = (vw - 40) / _dims.svgW, sy = (vh - 40) / _dims.svgH;
      state.scale = Math.min(sx, sy, 1);
      state.x = (vw - _dims.svgW * state.scale) / 2;
      state.y = 20;
      if (state._update) state._update();
    }

    function load() {
      if (state.built) return;
      fetch(cfg.mdFile + "?v=" + (typeof CACHE_VERSION !== "undefined" ? CACHE_VERSION : Date.now()))
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(md => {
          const m = md.match(/```mermaid\s*\n([\s\S]*?)```/);
          if (!m) { console.warn("[mermaid-view] No mermaid block in", cfg.mdFile); return; }
          const ast = parseMermaid(m[1]);
          const legend = extractLegend(ast);
          console.log("[mermaid-view] legend:", legend.legendNodes.length, "nodes,", legend.legendIds.size, "sgIds");
          _dims = buildDiagram(ast, cfg.colors, state.world, _svgLayer, legend.legendIds);
          state.built = true;

          // Build filter pills from legend
          const pillContainer = document.getElementById(cfg.filterId);
          console.log("[mermaid-view] pillContainer:", cfg.filterId, pillContainer, "legendNodes:", legend.legendNodes);
          if (pillContainer && legend.legendNodes.length) {
            buildFilters(pillContainer, legend.legendNodes, cfg.colors, _dims.nodeElements, _dims.edgeElements);
          } else {
            console.warn("[mermaid-view] No filter pills: container=", !!pillContainer, "nodes=", legend.legendNodes.length);
          }

          requestAnimationFrame(fitView);
        })
        .catch(err => console.error("[mermaid-view]", cfg.mdFile, err));
    }

    function open() {
      toggleModal(modal, true);
      if (!state.built) load(); else requestAnimationFrame(fitView);
    }
    function close() { toggleModal(modal, false); }

    // Wire DOM
    const vp = modal.querySelector(".mm-viewport");
    if (vp) {
      state.world = modal.querySelector(".mm-world");
      _svgLayer   = modal.querySelector(".mm-edges");
      if (state.world && _svgLayer) initPanZoom(vp, state);
    }

    const closeBtn = document.getElementById(cfg.closeId);
    if (closeBtn) closeBtn.addEventListener("click", close);
    modal.addEventListener("click", e => { if (e.target === modal) close(); });
    document.addEventListener("keydown", e => {
      if (e.key === "Escape" && modal.classList.contains("open")) close();
    });

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
    colors: {
      hosting: "242,80,34",
      config:  "255,185,0",
      styling: "200,120,180",
      script:  "127,186,0",
      data:    "0,120,212",
      asset:   "100,160,220",
      output:  "255,185,0",
      footer:  "120,120,120",
    },
  });

  // ── MARP Wiring Diagram ────────────────────────────────────
  createDiagram({
    modalId:     "marp-modal",
    closeId:     "marpModalClose",
    filterId:    "marp-filters",
    mdFile:      "marp-architecture.md",
    openGlobal:  "openMarpModal",
    closeGlobal: "closeMarpModal",
    colors: {
      battery:   "231,76,60",
      control:   "249,168,37",
      converter: "194,181,244",
      driver:    "136,179,225",
      compute:   "141,211,199",
      sensor:    "205,225,247",
      light:     "217,140,179",
      motor:     "253,216,53",
      footer:    "120,120,120",
    },
  });

})();
