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
  const MIN_SCALE = 0.5;
  const MAX_SCALE = 1.5;

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
      if (line.includes("CNAME") && line.includes("-->")) console.log("[mm] CNAME edge line found:", JSON.stringify(line));
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
        console.log("[mm] parsed edge:", edgeMatch[1], "->", edgeMatch[4], "label:", edgeMatch[3]);
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
      } else if (!bareMatch) {
        console.log("[mm] UNMATCHED line:", JSON.stringify(line));
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
    function walk(s) {
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
    function walkLegend(sg) {
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
    console.log("[mm] edges to draw:", ast.edges.length, ast.edges.map(e => e.from + "->" + e.to));
    ast.edges.forEach(edge => {
      let fromPt = nodeElements[edge.from], toPt = nodeElements[edge.to];
      let fromSg = null, toSg = null;
      if (!fromPt && sgBounds.has(edge.from)) { const b = sgBounds.get(edge.from); fromPt = { x: b.cx, y: b.cy, cls: inferSubgraphClass(edge.from, ast) }; fromSg = b; }
      if (!toPt && sgBounds.has(edge.to))     { const b = sgBounds.get(edge.to);   toPt   = { x: b.cx, y: b.cy, cls: inferSubgraphClass(edge.to, ast) };   toSg   = b; }
      if (!fromPt || !toPt) { console.log("[mm] SKIP edge", edge.from, "->", edge.to, "fromPt:", !!fromPt, "toPt:", !!toPt); return; }

      // Determine edge color: prefer the TARGET's class so the arrow
      // color reflects what is being accessed / consumed.
      // Special case: if exactly one end is "hosting", use the other.
      const fCls = fromPt.cls || "";
      const tCls = toPt.cls || "";
      let edgeCls;
      if (fCls && tCls && fCls !== tCls) {
        edgeCls = (tCls === "hosting") ? fCls : tCls;
      } else {
        edgeCls = tCls || fCls || "";
      }
      const edgeTC = colors[edgeCls] || "255,255,255";

      const fHH = fromSg ? fromSg.h / 2 : NODE_H / 2;
      const tHH = toSg   ? toSg.h / 2   : NODE_H / 2;

      // Determine direction: if target center is above source center,
      // exit top-center of source → enter bottom-center of target (upward arrow).
      // Otherwise exit bottom-center of source → enter top-center of target (downward).
      const goingUp = toPt.y < fromPt.y;
      let x1, y1, x2, y2;
      if (goingUp) {
        x1 = fromPt.x; y1 = fromPt.y - fHH;   // exit top-center
        x2 = toPt.x;   y2 = toPt.y + tHH;      // enter bottom-center
      } else {
        x1 = fromPt.x; y1 = fromPt.y + fHH;    // exit bottom-center
        x2 = toPt.x;   y2 = toPt.y - tHH;      // enter top-center
      }

      const path = document.createElementNS(svgNS, "path");
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
        // Same row (gap ≈ 0) — S-curve via a side detour
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
      path.dataset.mmFrom = edge.from;
      path.dataset.mmTo = edge.to;
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
        bg.setAttribute("rx", "6"); bg.setAttribute("fill", edge.dashed ? "rgba(15,15,20,0.4)" : "rgba(15,15,20,0.8)");
        bg.setAttribute("stroke", edge.dashed ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.15)"); bg.setAttribute("stroke-width", "0.5");
        g.appendChild(bg);
        labelLines.forEach((ln, i) => {
          const t = document.createElementNS(svgNS, "text");
          t.setAttribute("x", lx); t.setAttribute("y", ly - totalLH / 2 + i * lh + lh - 2);
          t.setAttribute("text-anchor", "middle"); t.setAttribute("fill", edge.dashed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.8)");
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

    // ── Hover interaction: highlight connected edges & nodes ──
    // Build adjacency: nodeId/sgId → [ { path, labelGroup, peerId } ]
    const adjacency = {};
    ast.edges.forEach(edge => {
      const pathEl = svgLayer.querySelector('.mm-edge[data-mm-from="' + edge.from + '"][data-mm-to="' + edge.to + '"]');
      const lblEl  = svgLayer.querySelector('.mm-edge-label-group[data-mm-from="' + edge.from + '"][data-mm-to="' + edge.to + '"]');
      if (!pathEl) return;
      if (!adjacency[edge.from]) adjacency[edge.from] = [];
      if (!adjacency[edge.to])   adjacency[edge.to]   = [];
      adjacency[edge.from].push({ path: pathEl, labelGroup: lblEl, peerId: edge.to });
      adjacency[edge.to].push({   path: pathEl, labelGroup: lblEl, peerId: edge.from });
    });

    // Subgraph lookup helpers (built early for use in highlight logic)
    const sgNodeMap = {};
    ast.subgraphs.forEach(sg => {
      const nodeSet = new Set();
      collectAllNodes(sg, sgMap, nodeSet);
      sgNodeMap[sg.id] = nodeSet;
    });

    function collectChildSgs(sgId, out) {
      const sg = sgMap.get(sgId);
      if (!sg) return;
      (sg.childSubgraphs || []).forEach(cid => {
        out.add(cid);
        collectChildSgs(cid, out);
      });
    }

    // Highlight an endpoint (could be a node OR a subgraph)
    function highlightEndpoint(id) {
      if (nodeElements[id]) {
        nodeElements[id].el.classList.add("mm-highlight");
      }
      // If this id is a subgraph, highlight the container + children + descendant nodes
      const sgEl = world.querySelector('.mm-subgraph[data-mm-sg="' + id + '"]');
      if (sgEl) {
        sgEl.classList.add("mm-highlight");
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

    // Node hover → highlight self + connected edges + peer nodes/subgraphs
    Object.values(nodeElements).forEach(({ el, x, y, cls }) => {
      const id = el.dataset.mmId;
      el.addEventListener("mouseenter", () => {
        if (_exploring) return;
        world.classList.add("mm-hovering");
        el.classList.add("mm-highlight");
        const adj = adjacency[id] || [];
        adj.forEach(a => {
          a.path.classList.add("mm-highlight");
          if (a.labelGroup) a.labelGroup.classList.add("mm-highlight");
          highlightEndpoint(a.peerId);
        });
      });
      el.addEventListener("mouseleave", clearHighlights);
    });

    // Edge hover → highlight the edge + both endpoint nodes/subgraphs
    svgLayer.querySelectorAll(".mm-edge[data-mm-from]").forEach(pathEl => {
      const fromId = pathEl.dataset.mmFrom;
      const toId   = pathEl.dataset.mmTo;
      const lblEl  = svgLayer.querySelector('.mm-edge-label-group[data-mm-from="' + fromId + '"][data-mm-to="' + toId + '"]');
      pathEl.addEventListener("mouseenter", () => {
        if (_exploring) return;
        world.classList.add("mm-hovering");
        pathEl.classList.add("mm-highlight");
        if (lblEl) lblEl.classList.add("mm-highlight");
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
        if (_exploring) return;
        world.classList.add("mm-hovering");
        highlightEndpoint(sgId);
        descendantNodes.forEach(nodeId => {
          if (nodeElements[nodeId]) nodeElements[nodeId].el.classList.add("mm-highlight");
          const adj = adjacency[nodeId] || [];
          adj.forEach(a => {
            a.path.classList.add("mm-highlight");
            if (a.labelGroup) a.labelGroup.classList.add("mm-highlight");
            highlightEndpoint(a.peerId);
          });
        });
      });
      header.addEventListener("mouseleave", clearHighlights);
    });

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

    // ── Pan bounds — keep content mostly visible ─────────────
    // Returns { minX, maxX, minY, maxY } for state.x/y so you
    // can never pan more than ~half the viewport past any edge.
    function getPanBounds() {
      if (!state._dims) return null;
      const vw = viewport.clientWidth, vh = viewport.clientHeight;
      const s = state.scale;
      const pad = 0.75;    // content edge can't go past 25% of viewport
      return {
        minX: vw * pad - state._dims.svgW * s,
        maxX: vw * (1 - pad),
        minY: vh * pad - state._dims.svgH * s,
        maxY: vh * (1 - pad),
      };
    }

    // Rubber-band: the further past bounds, the harder it resists
    function rubberBand(val, min, max) {
      if (val >= min && val <= max) return val;
      const limit = 60;           // max overshoot in px
      const over = val < min ? min - val : val - max;
      const damped = limit * (1 - Math.exp(-over / limit));  // asymptotic
      return val < min ? min - damped : max + damped;
    }

    let _panBounceTimer = null;
    function bounceBackIfNeeded() {
      const bounds = getPanBounds();
      if (!bounds) return;
      let tx = state.x, ty = state.y, clamped = false;
      if (tx < bounds.minX) { tx = bounds.minX; clamped = true; }
      if (tx > bounds.maxX) { tx = bounds.maxX; clamped = true; }
      if (ty < bounds.minY) { ty = bounds.minY; clamped = true; }
      if (ty > bounds.maxY) { ty = bounds.maxY; clamped = true; }
      if (clamped) {
        state.x = tx; state.y = ty;
        state.world.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
        update();
        if (_panBounceTimer) clearTimeout(_panBounceTimer);
        _panBounceTimer = setTimeout(function () { state.world.style.transition = ""; }, 340);
      }
    }

    viewport.addEventListener("pointerdown", e => {
      if (e.target.closest(".mm-node") || e.target.closest(".mm-explore-hint")) return;
      isPanning = true; startX = e.clientX; startY = e.clientY;
      startTX = state.x; startTY = state.y;
      viewport.style.cursor = "grabbing"; viewport.setPointerCapture(e.pointerId);
    });
    viewport.addEventListener("pointermove", e => {
      if (!isPanning) return;
      let nx = startTX + (e.clientX - startX), ny = startTY + (e.clientY - startY);
      const bounds = getPanBounds();
      if (bounds) { nx = rubberBand(nx, bounds.minX, bounds.maxX); ny = rubberBand(ny, bounds.minY, bounds.maxY); }
      state.x = nx; state.y = ny; update();
    });
    viewport.addEventListener("pointerup", () => {
      isPanning = false; viewport.style.cursor = "grab";
      bounceBackIfNeeded();
    });
    viewport.addEventListener("pointercancel", () => {
      isPanning = false; viewport.style.cursor = "grab";
      bounceBackIfNeeded();
    });

    let _zoomBounceTimer = null;
    viewport.addEventListener("wheel", e => {
      e.preventDefault();
      const rect = viewport.getBoundingClientRect();
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      const prev = state.scale;
      const raw = state.scale * (e.deltaY > 0 ? 0.92 : 1.08);
      const clamped = Math.max(MIN_SCALE, Math.min(MAX_SCALE, raw));
      const atLimit = raw !== clamped;
      state.scale = clamped;
      const ratio = state.scale / prev;
      state.x = mx - ratio * (mx - state.x); state.y = my - ratio * (my - state.y);
      update();

      if (atLimit) {
        // Elastic overshoot then spring back (matches skill-tree feel)
        if (_zoomBounceTimer) clearTimeout(_zoomBounceTimer);
        const overshoot = raw < MIN_SCALE ? MIN_SCALE * 0.92 : MAX_SCALE * 1.06;
        state.scale = overshoot;
        const oRatio = state.scale / clamped;
        state.x = mx - oRatio * (mx - state.x); state.y = my - oRatio * (my - state.y);
        state.world.style.transition = "transform 0.08s ease-out";
        update();
        _zoomBounceTimer = setTimeout(function () {
          state.scale = clamped;
          const bRatio = clamped / overshoot;
          state.x = mx - bRatio * (mx - state.x); state.y = my - bRatio * (my - state.y);
          state.world.style.transition = "transform 0.3s cubic-bezier(0.25, 1, 0.5, 1)";
          update();
          setTimeout(function () { state.world.style.transition = ""; bounceBackIfNeeded(); }, 320);
        }, 80);
      } else {
        bounceBackIfNeeded();
      }
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
    viewport.addEventListener("touchend", () => { bounceBackIfNeeded(); }, { passive: true });
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

    function edgeCat(fromCls, toCls) {
      if (fromCls && toCls && fromCls !== toCls) {
        return (toCls === "hosting") ? fromCls : toCls;
      }
      return toCls || fromCls || "";
    }

    // 1. Determine which edges survive based on their color-category
    const survivingEdges = [];
    const neededNodeIds = new Set();

    ast.edges.forEach(edge => {
      const fromCls = nodeCls(edge.from);
      const toCls   = nodeCls(edge.to);
      const edgeCategory = edgeCat(fromCls, toCls);
      if (!edgeCategory || keep.has(edgeCategory)) {
        survivingEdges.push(edge);
        neededNodeIds.add(edge.from);
        neededNodeIds.add(edge.to);
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
      };
    }
    const subgraphs = ast.subgraphs.map(cloneSG);

    // 6. Collapse empty subgraphs
    const sgMap = new Map();
    subgraphs.forEach(sg => sgMap.set(sg.id, sg));
    function hasContent(sg) {
      if (sg.children.length > 0) return true;
      return (sg.childSubgraphs || []).some(cid => {
        const ch = sgMap.get(cid);
        return ch && hasContent(ch);
      });
    }
    subgraphs.forEach(sg => {
      sg.childSubgraphs = (sg.childSubgraphs || []).filter(cid => {
        const ch = sgMap.get(cid);
        return ch && hasContent(ch);
      });
    });
    const liveSubgraphs = subgraphs.filter(sg => hasContent(sg));

    // 7. Final edge filter: both endpoints must be a node or a surviving subgraph
    const liveSgIds = new Set(liveSubgraphs.map(sg => sg.id));
    const edges = survivingEdges.filter(e => (nodes[e.from] || liveSgIds.has(e.from)) && (nodes[e.to] || liveSgIds.has(e.to)));

    return { title: ast.title, nodes, edges, subgraphs: liveSubgraphs, classDefs: ast.classDefs, classAssigns: ast.classAssigns };
  }

  function buildFilters(pillContainer, legendNodes, colors, rebuild) {
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
      if (activeFilters.size === allClasses.length) return;
      setAll();
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
    let _ast = null, _legend = null;
    let _visibleBounds = null;  // { x, y, w, h } of visible content

    function fitView(animate) {
      const vp = modal.querySelector(".mm-viewport");
      if (!vp || !state.world || !_dims) return;
      const vw = vp.clientWidth, vh = vp.clientHeight;
      // Use visible bounds if available, else full diagram
      const bw = _visibleBounds ? _visibleBounds.w : _dims.svgW;
      const bh = _visibleBounds ? _visibleBounds.h : _dims.svgH;
      const bx = _visibleBounds ? _visibleBounds.x : 0;
      const by = _visibleBounds ? _visibleBounds.y : 0;
      const sx = (vw - 40) / bw, sy = (vh - 40) / bh;
      const fitScale = Math.min(sx, sy, 1);
      state.scale = fitScale;
      // Center on the visible content bounding box
      state.x = (vw - bw * state.scale) / 2 - bx * state.scale;
      state.y = (vh - bh * state.scale) / 2 - by * state.scale;
      if (animate) {
        state.world.style.transition = "transform 0.5s cubic-bezier(0.25, 1, 0.5, 1)";
        setTimeout(() => { state.world.style.transition = ""; }, 550);
      }
      if (state._update) state._update();
    }

    function rebuild(activeClasses) {
      if (!_ast || !_svgLayer) return;

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

      // ── Glow newly-revealed elements during explore tour ───
      if (_exploring) {
        // Clear any prior explore highlights
        state.world.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
        _svgLayer.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
        state.world.classList.add("mm-explore-hovering");

        // Highlight newly visible nodes
        state.world.querySelectorAll(".mm-node[data-mm-id]:not(.mm-hidden)").forEach(el => {
          if (!prevVisibleNodes.has(el.dataset.mmId)) {
            el.classList.add("mm-explore-glow");
          }
        });
        // Highlight newly visible subgraphs
        state.world.querySelectorAll(".mm-subgraph[data-mm-sg]:not(.mm-hidden)").forEach(el => {
          if (!prevVisibleSgs.has(el.dataset.mmSg)) {
            el.classList.add("mm-explore-glow");
          }
        });
        // Highlight newly visible edges + labels
        _svgLayer.querySelectorAll(".mm-edge[data-mm-from]:not(.mm-hidden)").forEach(el => {
          const key = el.dataset.mmFrom + "->" + el.dataset.mmTo;
          if (!prevVisibleEdges.has(key)) {
            el.classList.add("mm-explore-glow");
          }
        });
        _svgLayer.querySelectorAll(".mm-edge-label-group[data-mm-from]:not(.mm-hidden)").forEach(el => {
          const key = el.dataset.mmFrom + "->" + el.dataset.mmTo;
          if (!prevVisibleEdges.has(key)) {
            el.classList.add("mm-explore-glow");
          }
        });

        // Fade out glow after 3s (matches tour step delay)
        if (_exploreGlowTimer) clearTimeout(_exploreGlowTimer);
        _exploreGlowTimer = setTimeout(function () {
          state.world.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
          _svgLayer.querySelectorAll(".mm-explore-glow").forEach(el => el.classList.remove("mm-explore-glow"));
          state.world.classList.remove("mm-explore-hovering");
        }, 3000);
      }

      // Compute bounding box of visible elements for camera fit
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      state.world.querySelectorAll(".mm-node[data-mm-id]:not(.mm-hidden)").forEach(el => {
        const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
        const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      });
      state.world.querySelectorAll(".mm-subgraph[data-mm-sg]:not(.mm-hidden)").forEach(el => {
        const x = parseFloat(el.style.left), y = parseFloat(el.style.top);
        const w = parseFloat(el.style.width), h = parseFloat(el.style.height);
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x + w > maxX) maxX = x + w;
        if (y + h > maxY) maxY = y + h;
      });

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
      fetch(cfg.mdFile + "?v=" + (typeof CACHE_VERSION !== "undefined" ? CACHE_VERSION : Date.now()))
        .then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
        .then(md => {
          const m = md.match(/```mermaid\s*\n([\s\S]*?)```/);
          if (!m) { console.warn("[mermaid-view] No mermaid block in", cfg.mdFile); return; }
          _ast = parseMermaid(m[1]);
          _legend = extractLegend(_ast);
          _dims = buildDiagram(_ast, cfg.colors, state.world, _svgLayer, _legend.legendIds);
          state._dims = _dims;
          state.built = true;

          // Build filter pills from legend
          const pillContainer = document.getElementById(cfg.filterId);
          if (pillContainer && _legend.legendNodes.length) {
            _filterAPI = buildFilters(pillContainer, _legend.legendNodes, cfg.colors, rebuild);
          }

          requestAnimationFrame(() => fitView(false));
        })
        .catch(err => console.error("[mermaid-view]", cfg.mdFile, err));
    }

    // ── Auto-explore tour ────────────────────────────────────
    let _filterAPI = null;
    let _exploreTimers = [];
    let _exploring = false;
    let _exploreGlowTimer = null;

    var EXPLORE_DEFAULT = '<strong>Explore</strong><span class="scroll-arrow">\uD83D\uDD2D</span>';

    // Crossfade helper: fade out → swap innerHTML → fade in
    var _fadePending = null;
    function crossfadeHint(hint, html, cb) {
      if (_fadePending) clearTimeout(_fadePending);
      hint.style.transition = "opacity 0.15s ease";
      hint.style.opacity = "0";
      _fadePending = setTimeout(function () {
        hint.innerHTML = html;
        if (cb) cb();
        // force reflow so opacity:0 is painted before we go to 1
        void hint.offsetWidth;
        hint.style.opacity = "1";
        _fadePending = setTimeout(function () {
          hint.style.transition = "";
          hint.style.opacity = "";
          _fadePending = null;
        }, 160);
      }, 160);
    }

    function resetHintLabel() {
      var hint = modal.querySelector(".mm-explore-hint");
      if (!hint) return;
      if (_exploring) {
        crossfadeHint(hint, EXPLORE_DEFAULT, function () { hint.classList.remove("exploring"); });
      } else {
        hint.innerHTML = EXPLORE_DEFAULT;
        hint.classList.remove("exploring");
      }
    }

    function setHintLabel(label) {
      var hint = modal.querySelector(".mm-explore-hint");
      if (!hint) return;
      // Split leading emoji from text
      var m = label.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u);
      var emoji = m ? m[1] : '\uD83D\uDD2D';
      var text  = m ? label.slice(m[0].length) : label;
      var html = '<strong>' + text + '</strong><span class="scroll-arrow">' + emoji + '</span>';
      crossfadeHint(hint, html);
    }

    function stopExplore() {
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
      if (_filterAPI) _filterAPI.setAll();
    }

    function startExplore() {
      if (!_filterAPI) return;

      // If already exploring, cancel and reset
      if (_exploring) {
        stopExplore();
        return;
      }

      _exploring = true;
      if (state.world) state.world.classList.add("mm-exploring");
      var hint = modal.querySelector(".mm-explore-hint");
      if (hint) hint.classList.add("exploring");
      var classes = _filterAPI.allClasses;
      var labels = _filterAPI.labelMap;
      var delay = 3000;

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

      // Hide everything first so the first setOnly reveals into an empty canvas
      _filterAPI.setNone();

      // Start with first category only
      _filterAPI.setOnly(classes[0]);
      setHintLabel(labels[classes[0]] || classes[0]);
      glowFilterPill(classes[0]);

      // Add each subsequent category one at a time
      for (var i = 1; i < classes.length; i++) {
        (function (idx) {
          _exploreTimers.push(setTimeout(function () {
            if (!_exploring) return;
            _filterAPI.addFilter(classes[idx]);
            setHintLabel(labels[classes[idx]] || classes[idx]);
            glowFilterPill(classes[idx]);
          }, delay * idx));
        })(i);
      }

      // Final: show all and reset hint to Explore
      _exploreTimers.push(setTimeout(function () {
        if (!_exploring) return;
        _filterAPI.setAll();
        _exploring = false;
        if (state.world) state.world.classList.remove("mm-exploring");
        // Clear pill glow
        if (pillContainer) pillContainer.querySelectorAll(".mm-filter-glow").forEach(function (el) { el.classList.remove("mm-filter-glow"); });
        resetHintLabel();
      }, delay * classes.length));
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
      if (state.world && _svgLayer) initPanZoom(vp, state);
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
    colors: {
      hosting: "242,80,34",
      config:  "255,185,0",
      styling: "242,80,34",
      script:  "127,186,0",
      data:    "0,120,212",
      asset:   "0,120,212",
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
