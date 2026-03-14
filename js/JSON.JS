// ═══════════════════════════════════════════════════════════════
//  JSON VIEWER — Interactive collapsible JSON tree visualization
//
//  Provides the JSON-specific pipeline (parser, layout engine,
//  renderer, filter logic) consumed by the generic createVizDiagram
//  factory in VIZ.JS.  All lifecycle plumbing (modal, pan/zoom,
//  filter pills, explore tour, camera fit, keyboard nav) is
//  handled by the engine.
//
//  Sections:
//    1. Parser — JSON → tree nodes with typed classification
//    2. Layout engine — recursive tree positioning
//    3. Renderer — DOM tiles + SVG edges + hover wiring
//    4. Filter system — type-based visibility toggling
//    5. Factory — createJsonDiagram() wraps createVizDiagram()
//    6. openJsonModal() — generic entry point
//
//  Depends on: VIZ.JS (createVizDiagram, initPanZoom,
//              createFilterSystem, createExploreHint,
//              animateCameraFit, createLayoutToggle,
//              createCrossfader, initVizKeyboardNav)
//              MODALS.JS (registerModal)
// ═══════════════════════════════════════════════════════════════
(() => {

  /* ─── Constants ────────────────────────────────────────────── */
  const NODE_W       = 180;
  const NODE_H       = 36;
  const NODE_GAP_X   = 40;
  const NODE_GAP_Y   = 6;
  const INDENT       = NODE_W + NODE_GAP_X;
  const MIN_SCALE    = 0.3;
  const MAX_SCALE    = 2;

  /* ─── Type classification & colors ─────────────────────────── */
  const TYPE_COLORS = {
    object:  '0,164,239',    // accent-1 blue
    array:   '242,80,34',    // accent-3 red
    string:  '127,186,0',    // accent-4 green
    number:  '255,185,0',    // accent-2 yellow
    boolean: '180,130,255',  // purple
    null:    '140,140,140',  // grey
  };

  const TYPE_ICONS = {
    object:  '{}',
    array:   '[]',
    string:  'abc',
    number:  '#',
    boolean: '⊘',
    null:    '∅',
  };

  /* ═════════════════════════════════════════════════════════════
     1. PARSER — JSON → flat node list with parent references
     ═════════════════════════════════════════════════════════════ */

  function parseJson(data) {
    var nodes = [];
    var edges = [];
    var id = 0;

    function classify(val) {
      if (val === null) return 'null';
      if (Array.isArray(val)) return 'array';
      return typeof val;  // 'object', 'string', 'number', 'boolean'
    }

    function walk(key, val, parentId, depth) {
      var type = classify(val);
      var nodeId = 'jv-' + (id++);
      var displayKey = key !== null ? key : '';
      var displayVal = '';
      var childCount = 0;
      var isLeaf = true;

      if (type === 'object') {
        var keys = Object.keys(val);
        childCount = keys.length;
        displayVal = '{ ' + childCount + ' }';
        isLeaf = false;
      } else if (type === 'array') {
        childCount = val.length;
        displayVal = '[ ' + childCount + ' ]';
        isLeaf = false;
      } else if (type === 'string') {
        displayVal = val.length > 40 ? '"' + val.slice(0, 37) + '…"' : '"' + val + '"';
      } else if (type === 'null') {
        displayVal = 'null';
      } else {
        displayVal = String(val);
      }

      var node = {
        id: nodeId,
        key: displayKey,
        value: displayVal,
        type: type,
        depth: depth,
        isLeaf: isLeaf,
        childCount: childCount,
        parentId: parentId,
      };
      nodes.push(node);

      if (parentId !== null) {
        edges.push({ from: parentId, to: nodeId });
      }

      if (type === 'object') {
        Object.keys(val).forEach(function (k) {
          walk(k, val[k], nodeId, depth + 1);
        });
      } else if (type === 'array') {
        val.forEach(function (item, i) {
          walk(String(i), item, nodeId, depth + 1);
        });
      }
    }

    walk(null, data, null, 0);

    return { nodes: nodes, edges: edges };
  }

  /* ═════════════════════════════════════════════════════════════
     2. LAYOUT — Recursive tree, vertical stacking, indented
     ═════════════════════════════════════════════════════════════ */

  function layoutTree(parsed, activeTypes) {
    var nodeMap = {};
    parsed.nodes.forEach(function (n) { nodeMap[n.id] = n; });

    // Build children map
    var children = {};
    parsed.nodes.forEach(function (n) { children[n.id] = []; });
    parsed.edges.forEach(function (e) {
      if (children[e.from]) children[e.from].push(e.to);
    });

    var positions = {};
    var curY = 0;

    function layout(nodeId) {
      var node = nodeMap[nodeId];
      if (!node) return;
      if (activeTypes && !activeTypes.has(node.type)) return;

      var x = node.depth * INDENT;
      var y = curY;
      positions[nodeId] = { x: x + NODE_W / 2, y: y + NODE_H / 2 };
      curY += NODE_H + NODE_GAP_Y;

      var kids = children[nodeId] || [];
      kids.forEach(function (cid) { layout(cid); });
    }

    // Find root(s)
    var roots = parsed.nodes.filter(function (n) { return n.parentId === null; });
    roots.forEach(function (r) { layout(r.id); });

    var totalW = 0, totalH = curY;
    Object.values(positions).forEach(function (p) {
      var right = p.x + NODE_W / 2;
      if (right > totalW) totalW = right;
    });
    totalW += NODE_GAP_X;

    return { positions: positions, totalW: totalW, totalH: totalH };
  }

  /* ═════════════════════════════════════════════════════════════
     3. RENDERER — DOM nodes + SVG edges + hover wiring
     ═════════════════════════════════════════════════════════════ */

  function buildJsonTree(parsed, positions, world, svgLayer, isExploring) {
    if (!isExploring) isExploring = function () { return false; };
    world.innerHTML = '';
    svgLayer.innerHTML = '';
    world.appendChild(svgLayer);

    var nodeMap = {};
    parsed.nodes.forEach(function (n) { nodeMap[n.id] = n; });

    var nodeElements = {};
    var svgNS = 'http://www.w3.org/2000/svg';

    // Build children lookup
    var childrenOf = {};
    parsed.edges.forEach(function (e) {
      if (!childrenOf[e.from]) childrenOf[e.from] = [];
      childrenOf[e.from].push(e.to);
    });

    // Render nodes
    parsed.nodes.forEach(function (node) {
      var pos = positions[node.id];
      if (!pos) return;

      var tc = TYPE_COLORS[node.type] || '160,160,160';
      var el = document.createElement('div');
      el.className = 'jv-node' + (node.isLeaf ? ' jv-leaf' : ' jv-branch');
      el.setAttribute('tabindex', '0');
      el.setAttribute('role', 'treeitem');
      el.dataset.jvId = node.id;
      el.dataset.jvType = node.type;
      el.style.setProperty('--tc', tc);
      el.style.left = (pos.x - NODE_W / 2) + 'px';
      el.style.top = (pos.y - NODE_H / 2) + 'px';
      el.style.width = NODE_W + 'px';
      el.style.height = NODE_H + 'px';

      // Type badge
      var badge = document.createElement('span');
      badge.className = 'jv-type-badge';
      badge.textContent = TYPE_ICONS[node.type] || '?';
      badge.style.color = 'rgb(' + tc + ')';
      el.appendChild(badge);

      // Key
      if (node.key) {
        var keyEl = document.createElement('span');
        keyEl.className = 'jv-key';
        keyEl.textContent = node.key;
        el.appendChild(keyEl);

        var sep = document.createElement('span');
        sep.className = 'jv-sep';
        sep.textContent = ':';
        el.appendChild(sep);
      }

      // Value
      var valEl = document.createElement('span');
      valEl.className = 'jv-val jv-val-' + node.type;
      valEl.textContent = node.value;
      el.appendChild(valEl);

      // Accessible label
      el.setAttribute('aria-label',
        (node.key ? node.key + ': ' : '') + node.value + ' (' + node.type + ')');

      world.appendChild(el);
      nodeElements[node.id] = { el: el, x: pos.x, y: pos.y, cls: node.type };
    });

    // Render edges — L-shaped connectors
    var edgePathLayer = document.createElementNS(svgNS, 'g');
    edgePathLayer.classList.add('jv-edge-layer');
    var edgeElements = [];

    parsed.edges.forEach(function (edge) {
      var fromNe = nodeElements[edge.from];
      var toNe = nodeElements[edge.to];
      if (!fromNe || !toNe) return;

      var tc = TYPE_COLORS[nodeMap[edge.from].type] || '160,160,160';
      var x1 = fromNe.x + NODE_W / 2 - 12;
      var y1 = fromNe.y;
      var x2 = toNe.x - NODE_W / 2;
      var y2 = toNe.y;

      // L-shaped path: go down from parent, then across to child
      var midX = x2 - 14;
      var path = document.createElementNS(svgNS, 'path');
      path.setAttribute('d',
        'M' + x1 + ',' + y1 +
        ' H' + midX +
        ' V' + y2 +
        ' H' + x2);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', 'rgba(' + tc + ',0.35)');
      path.setAttribute('stroke-width', '1.5');
      path.setAttribute('stroke-linecap', 'round');
      path.classList.add('jv-edge');
      path.dataset.jvFrom = edge.from;
      path.dataset.jvTo = edge.to;

      edgePathLayer.appendChild(path);
      edgeElements.push({ path: path, from: edge.from, to: edge.to });
    });

    svgLayer.appendChild(edgePathLayer);

    // Set SVG dimensions
    var totalW = 0, totalH = 0;
    Object.values(positions).forEach(function (p) {
      var r = p.x + NODE_W / 2;
      var b = p.y + NODE_H / 2;
      if (r > totalW) totalW = r;
      if (b > totalH) totalH = b;
    });
    totalW += NODE_GAP_X * 2;
    totalH += NODE_GAP_Y * 2;

    world.style.width = totalW + 'px';
    world.style.height = totalH + 'px';

    // ── Hover interaction — highlight ancestors + descendants ──
    var parentOf = {};
    parsed.edges.forEach(function (e) { parentOf[e.to] = e.from; });

    function getAncestors(nodeId) {
      var ancestors = [];
      var cur = parentOf[nodeId];
      while (cur) { ancestors.push(cur); cur = parentOf[cur]; }
      return ancestors;
    }

    function getDescendants(nodeId) {
      var desc = [];
      var stack = (childrenOf[nodeId] || []).slice();
      while (stack.length) {
        var cid = stack.pop();
        desc.push(cid);
        (childrenOf[cid] || []).forEach(function (gc) { stack.push(gc); });
      }
      return desc;
    }

    function clearHighlights() {
      world.classList.remove('jv-hovering');
      world.querySelectorAll('.jv-highlight').forEach(function (el) {
        el.classList.remove('jv-highlight');
      });
      svgLayer.querySelectorAll('.jv-highlight').forEach(function (el) {
        el.classList.remove('jv-highlight');
      });
    }

    Object.keys(nodeElements).forEach(function (nid) {
      var ne = nodeElements[nid];
      ne.el.addEventListener('mouseenter', function () {
        if (isExploring()) return;
        world.classList.add('jv-hovering');
        ne.el.classList.add('jv-highlight');

        // Highlight ancestors
        getAncestors(nid).forEach(function (aid) {
          if (nodeElements[aid]) nodeElements[aid].el.classList.add('jv-highlight');
        });
        // Highlight descendants
        getDescendants(nid).forEach(function (did) {
          if (nodeElements[did]) nodeElements[did].el.classList.add('jv-highlight');
        });
        // Highlight connected edges
        edgeElements.forEach(function (ee) {
          var connected = ee.from === nid || ee.to === nid ||
            getAncestors(nid).indexOf(ee.from) >= 0 && getAncestors(nid).indexOf(ee.to) >= 0 ||
            getDescendants(nid).indexOf(ee.to) >= 0 ||
            getDescendants(nid).indexOf(ee.from) >= 0;

          // Simpler: highlight edges in the path from root → node → leaves
          var allRelated = [nid].concat(getAncestors(nid)).concat(getDescendants(nid));
          var relSet = new Set(allRelated);
          if (relSet.has(ee.from) && relSet.has(ee.to)) {
            ee.path.classList.add('jv-highlight');
          }
        });
      });
      ne.el.addEventListener('mouseleave', clearHighlights);
    });

    return {
      svgW: totalW,
      svgH: totalH,
      nodeElements: nodeElements,
      edgeElements: edgeElements,
    };
  }

  /* ═════════════════════════════════════════════════════════════
     4. FILTER — type-based visibility (static mode)
     ═════════════════════════════════════════════════════════════ */

  function jsonStaticFilter(parsed, activeTypes, world, svgLayer) {
    // Show/hide nodes based on type
    world.querySelectorAll('.jv-node[data-jv-type]').forEach(function (el) {
      el.classList.toggle('jv-hidden', !activeTypes.has(el.dataset.jvType));
    });

    // Show/hide edges where both endpoints are visible
    var visibleNodes = new Set();
    world.querySelectorAll('.jv-node[data-jv-type]:not(.jv-hidden)').forEach(function (el) {
      visibleNodes.add(el.dataset.jvId);
    });

    svgLayer.querySelectorAll('.jv-edge[data-jv-from]').forEach(function (el) {
      el.classList.toggle('jv-hidden',
        !visibleNodes.has(el.dataset.jvFrom) || !visibleNodes.has(el.dataset.jvTo));
    });

    // Compute visible bounds
    var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    world.querySelectorAll('.jv-node:not(.jv-hidden)').forEach(function (el) {
      var x = parseFloat(el.style.left), y = parseFloat(el.style.top);
      var w = parseFloat(el.style.width), h = parseFloat(el.style.height);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x + w > maxX) maxX = x + w;
      if (y + h > maxY) maxY = y + h;
    });

    if (minX < Infinity) {
      var pad = 20;
      return { bounds: { x: minX - pad, y: minY - pad, w: (maxX - minX) + pad * 2, h: (maxY - minY) + pad * 2 } };
    }
    return null;
  }

  /* ═════════════════════════════════════════════════════════════
     5. FACTORY — JSON-specific plugin for createVizDiagram
     ═════════════════════════════════════════════════════════════ */

  function createJsonDiagram(cfg) {
    var _parsed = null;

    createVizDiagram({
      modalId:              cfg.modalId,
      filterId:             cfg.filterId,
      ariaLabel:            cfg.ariaLabel,
      openGlobal:           cfg.openGlobal,
      closeGlobal:          cfg.closeGlobal,
      nodeActions:          cfg.nodeActions,
      nodeIgnoreSelector:   '.jv-node',
      hiddenClass:          'jv-hidden',
      startStatic:          true,
      minScale:             MIN_SCALE,
      maxScale:             MAX_SCALE,
      maxFitScale:          1.2,
      rubberBandDrag:       true,
      zoomStep:             [0.92, 1.08],
      fitPadding:           30,
      fitDuration:          800,
      exploreStepDuration:  2500,

      load: function () {
        if (cfg.jsonData) {
          return Promise.resolve(JSON.stringify(cfg.jsonData));
        }
        return fetch(cfg.jsonFile + '?v=' + Date.now())
          .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); });
      },

      build: function (source, world, svgLayer, ctx) {
        var data;
        if (typeof source === 'string') {
          data = JSON.parse(source);
        } else {
          data = source;
        }

        _parsed = parseJson(data);
        var lay = layoutTree(_parsed, null);
        var dims = buildJsonTree(_parsed, lay.positions, world, svgLayer,
          function () { return ctx.isExploring(); });

        // Derive filter types from actual data
        var typesUsed = new Set();
        _parsed.nodes.forEach(function (n) { typesUsed.add(n.type); });

        var filters = [];
        var typeOrder = ['object', 'array', 'string', 'number', 'boolean', 'null'];
        typeOrder.forEach(function (t) {
          if (typesUsed.has(t)) {
            filters.push({
              cls: t,
              label: TYPE_ICONS[t] + ' ' + t,
              color: TYPE_COLORS[t],
              emoji: TYPE_ICONS[t],
            });
          }
        });

        return {
          svgW: dims.svgW,
          svgH: dims.svgH,
          nodeElements: dims.nodeElements,
          filters: filters,

          rebuild: function (activeTypes, ctx2) {
            var lay2 = layoutTree(_parsed, activeTypes);
            var d = buildJsonTree(_parsed, lay2.positions, world, svgLayer,
              function () { return ctx2.isExploring(); });
            return { svgW: d.svgW, svgH: d.svgH, nodeElements: d.nodeElements };
          },

          applyFilter: function (activeTypes, ctx2) {
            return jsonStaticFilter(_parsed, activeTypes, world, svgLayer);
          },
        };
      },
    });
  }

  /* ═════════════════════════════════════════════════════════════
     6. GENERIC ENTRY POINT — openJsonModal(jsonFile, opts?)
     ═════════════════════════════════════════════════════════════ */

  var _cache = {};

  window.openJsonModal = function (jsonFile, opts) {
    opts = opts || {};
    if (!_cache[jsonFile]) {
      var slug = jsonFile.replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();
      _cache[jsonFile] = {
        modalId:     'jv-' + slug,
        filterId:    'jv-' + slug + '-filters',
        jsonFile:    jsonFile,
        jsonData:    opts.jsonData || null,
        ariaLabel:   opts.ariaLabel || jsonFile.replace(/.*\//, '').replace(/\.json$/i, '') + ' JSON viewer',
        openGlobal:  '_jv_open_' + slug,
        closeGlobal: '_jv_close_' + slug,
        nodeActions: opts.nodeActions || null,
      };
      createJsonDiagram(_cache[jsonFile]);
    }
    var fn = window[_cache[jsonFile].openGlobal];
    if (fn) fn();
  };

})();
