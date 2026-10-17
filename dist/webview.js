"use strict";
(() => {
  // node_modules/d3-quadtree/src/add.js
  function add_default(d) {
    const x3 = +this._x.call(null, d), y3 = +this._y.call(null, d);
    return add(this.cover(x3, y3), x3, y3, d);
  }
  function add(tree, x3, y3, d) {
    if (isNaN(x3) || isNaN(y3))
      return tree;
    var parent, node = tree._root, leaf = { data: d }, x0 = tree._x0, y0 = tree._y0, x1 = tree._x1, y1 = tree._y1, xm, ym, xp, yp, right, bottom, i, j;
    if (!node)
      return tree._root = leaf, tree;
    while (node.length) {
      if (right = x3 >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y3 >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
      if (parent = node, !(node = node[i = bottom << 1 | right]))
        return parent[i] = leaf, tree;
    }
    xp = +tree._x.call(null, node.data);
    yp = +tree._y.call(null, node.data);
    if (x3 === xp && y3 === yp)
      return leaf.next = node, parent ? parent[i] = leaf : tree._root = leaf, tree;
    do {
      parent = parent ? parent[i] = new Array(4) : tree._root = new Array(4);
      if (right = x3 >= (xm = (x0 + x1) / 2))
        x0 = xm;
      else
        x1 = xm;
      if (bottom = y3 >= (ym = (y0 + y1) / 2))
        y0 = ym;
      else
        y1 = ym;
    } while ((i = bottom << 1 | right) === (j = (yp >= ym) << 1 | xp >= xm));
    return parent[j] = node, parent[i] = leaf, tree;
  }
  function addAll(data) {
    var d, i, n = data.length, x3, y3, xz = new Array(n), yz = new Array(n), x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (i = 0; i < n; ++i) {
      if (isNaN(x3 = +this._x.call(null, d = data[i])) || isNaN(y3 = +this._y.call(null, d)))
        continue;
      xz[i] = x3;
      yz[i] = y3;
      if (x3 < x0)
        x0 = x3;
      if (x3 > x1)
        x1 = x3;
      if (y3 < y0)
        y0 = y3;
      if (y3 > y1)
        y1 = y3;
    }
    if (x0 > x1 || y0 > y1)
      return this;
    this.cover(x0, y0).cover(x1, y1);
    for (i = 0; i < n; ++i) {
      add(this, xz[i], yz[i], data[i]);
    }
    return this;
  }

  // node_modules/d3-quadtree/src/cover.js
  function cover_default(x3, y3) {
    if (isNaN(x3 = +x3) || isNaN(y3 = +y3))
      return this;
    var x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1;
    if (isNaN(x0)) {
      x1 = (x0 = Math.floor(x3)) + 1;
      y1 = (y0 = Math.floor(y3)) + 1;
    } else {
      var z = x1 - x0 || 1, node = this._root, parent, i;
      while (x0 > x3 || x3 >= x1 || y0 > y3 || y3 >= y1) {
        i = (y3 < y0) << 1 | x3 < x0;
        parent = new Array(4), parent[i] = node, node = parent, z *= 2;
        switch (i) {
          case 0:
            x1 = x0 + z, y1 = y0 + z;
            break;
          case 1:
            x0 = x1 - z, y1 = y0 + z;
            break;
          case 2:
            x1 = x0 + z, y0 = y1 - z;
            break;
          case 3:
            x0 = x1 - z, y0 = y1 - z;
            break;
        }
      }
      if (this._root && this._root.length)
        this._root = node;
    }
    this._x0 = x0;
    this._y0 = y0;
    this._x1 = x1;
    this._y1 = y1;
    return this;
  }

  // node_modules/d3-quadtree/src/data.js
  function data_default() {
    var data = [];
    this.visit(function(node) {
      if (!node.length)
        do
          data.push(node.data);
        while (node = node.next);
    });
    return data;
  }

  // node_modules/d3-quadtree/src/extent.js
  function extent_default(_) {
    return arguments.length ? this.cover(+_[0][0], +_[0][1]).cover(+_[1][0], +_[1][1]) : isNaN(this._x0) ? void 0 : [[this._x0, this._y0], [this._x1, this._y1]];
  }

  // node_modules/d3-quadtree/src/quad.js
  function quad_default(node, x0, y0, x1, y1) {
    this.node = node;
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
  }

  // node_modules/d3-quadtree/src/find.js
  function find_default(x3, y3, radius) {
    var data, x0 = this._x0, y0 = this._y0, x1, y1, x22, y22, x32 = this._x1, y32 = this._y1, quads = [], node = this._root, q, i;
    if (node)
      quads.push(new quad_default(node, x0, y0, x32, y32));
    if (radius == null)
      radius = Infinity;
    else {
      x0 = x3 - radius, y0 = y3 - radius;
      x32 = x3 + radius, y32 = y3 + radius;
      radius *= radius;
    }
    while (q = quads.pop()) {
      if (!(node = q.node) || (x1 = q.x0) > x32 || (y1 = q.y0) > y32 || (x22 = q.x1) < x0 || (y22 = q.y1) < y0)
        continue;
      if (node.length) {
        var xm = (x1 + x22) / 2, ym = (y1 + y22) / 2;
        quads.push(
          new quad_default(node[3], xm, ym, x22, y22),
          new quad_default(node[2], x1, ym, xm, y22),
          new quad_default(node[1], xm, y1, x22, ym),
          new quad_default(node[0], x1, y1, xm, ym)
        );
        if (i = (y3 >= ym) << 1 | x3 >= xm) {
          q = quads[quads.length - 1];
          quads[quads.length - 1] = quads[quads.length - 1 - i];
          quads[quads.length - 1 - i] = q;
        }
      } else {
        var dx = x3 - +this._x.call(null, node.data), dy = y3 - +this._y.call(null, node.data), d2 = dx * dx + dy * dy;
        if (d2 < radius) {
          var d = Math.sqrt(radius = d2);
          x0 = x3 - d, y0 = y3 - d;
          x32 = x3 + d, y32 = y3 + d;
          data = node.data;
        }
      }
    }
    return data;
  }

  // node_modules/d3-quadtree/src/remove.js
  function remove_default(d) {
    if (isNaN(x3 = +this._x.call(null, d)) || isNaN(y3 = +this._y.call(null, d)))
      return this;
    var parent, node = this._root, retainer, previous, next, x0 = this._x0, y0 = this._y0, x1 = this._x1, y1 = this._y1, x3, y3, xm, ym, right, bottom, i, j;
    if (!node)
      return this;
    if (node.length)
      while (true) {
        if (right = x3 >= (xm = (x0 + x1) / 2))
          x0 = xm;
        else
          x1 = xm;
        if (bottom = y3 >= (ym = (y0 + y1) / 2))
          y0 = ym;
        else
          y1 = ym;
        if (!(parent = node, node = node[i = bottom << 1 | right]))
          return this;
        if (!node.length)
          break;
        if (parent[i + 1 & 3] || parent[i + 2 & 3] || parent[i + 3 & 3])
          retainer = parent, j = i;
      }
    while (node.data !== d)
      if (!(previous = node, node = node.next))
        return this;
    if (next = node.next)
      delete node.next;
    if (previous)
      return next ? previous.next = next : delete previous.next, this;
    if (!parent)
      return this._root = next, this;
    next ? parent[i] = next : delete parent[i];
    if ((node = parent[0] || parent[1] || parent[2] || parent[3]) && node === (parent[3] || parent[2] || parent[1] || parent[0]) && !node.length) {
      if (retainer)
        retainer[j] = node;
      else
        this._root = node;
    }
    return this;
  }
  function removeAll(data) {
    for (var i = 0, n = data.length; i < n; ++i)
      this.remove(data[i]);
    return this;
  }

  // node_modules/d3-quadtree/src/root.js
  function root_default() {
    return this._root;
  }

  // node_modules/d3-quadtree/src/size.js
  function size_default() {
    var size = 0;
    this.visit(function(node) {
      if (!node.length)
        do
          ++size;
        while (node = node.next);
    });
    return size;
  }

  // node_modules/d3-quadtree/src/visit.js
  function visit_default(callback) {
    var quads = [], q, node = this._root, child, x0, y0, x1, y1;
    if (node)
      quads.push(new quad_default(node, this._x0, this._y0, this._x1, this._y1));
    while (q = quads.pop()) {
      if (!callback(node = q.node, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1) && node.length) {
        var xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        if (child = node[3])
          quads.push(new quad_default(child, xm, ym, x1, y1));
        if (child = node[2])
          quads.push(new quad_default(child, x0, ym, xm, y1));
        if (child = node[1])
          quads.push(new quad_default(child, xm, y0, x1, ym));
        if (child = node[0])
          quads.push(new quad_default(child, x0, y0, xm, ym));
      }
    }
    return this;
  }

  // node_modules/d3-quadtree/src/visitAfter.js
  function visitAfter_default(callback) {
    var quads = [], next = [], q;
    if (this._root)
      quads.push(new quad_default(this._root, this._x0, this._y0, this._x1, this._y1));
    while (q = quads.pop()) {
      var node = q.node;
      if (node.length) {
        var child, x0 = q.x0, y0 = q.y0, x1 = q.x1, y1 = q.y1, xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
        if (child = node[0])
          quads.push(new quad_default(child, x0, y0, xm, ym));
        if (child = node[1])
          quads.push(new quad_default(child, xm, y0, x1, ym));
        if (child = node[2])
          quads.push(new quad_default(child, x0, ym, xm, y1));
        if (child = node[3])
          quads.push(new quad_default(child, xm, ym, x1, y1));
      }
      next.push(q);
    }
    while (q = next.pop()) {
      callback(q.node, q.x0, q.y0, q.x1, q.y1);
    }
    return this;
  }

  // node_modules/d3-quadtree/src/x.js
  function defaultX(d) {
    return d[0];
  }
  function x_default(_) {
    return arguments.length ? (this._x = _, this) : this._x;
  }

  // node_modules/d3-quadtree/src/y.js
  function defaultY(d) {
    return d[1];
  }
  function y_default(_) {
    return arguments.length ? (this._y = _, this) : this._y;
  }

  // node_modules/d3-quadtree/src/quadtree.js
  function quadtree(nodes, x3, y3) {
    var tree = new Quadtree(x3 == null ? defaultX : x3, y3 == null ? defaultY : y3, NaN, NaN, NaN, NaN);
    return nodes == null ? tree : tree.addAll(nodes);
  }
  function Quadtree(x3, y3, x0, y0, x1, y1) {
    this._x = x3;
    this._y = y3;
    this._x0 = x0;
    this._y0 = y0;
    this._x1 = x1;
    this._y1 = y1;
    this._root = void 0;
  }
  function leaf_copy(leaf) {
    var copy = { data: leaf.data }, next = copy;
    while (leaf = leaf.next)
      next = next.next = { data: leaf.data };
    return copy;
  }
  var treeProto = quadtree.prototype = Quadtree.prototype;
  treeProto.copy = function() {
    var copy = new Quadtree(this._x, this._y, this._x0, this._y0, this._x1, this._y1), node = this._root, nodes, child;
    if (!node)
      return copy;
    if (!node.length)
      return copy._root = leaf_copy(node), copy;
    nodes = [{ source: node, target: copy._root = new Array(4) }];
    while (node = nodes.pop()) {
      for (var i = 0; i < 4; ++i) {
        if (child = node.source[i]) {
          if (child.length)
            nodes.push({ source: child, target: node.target[i] = new Array(4) });
          else
            node.target[i] = leaf_copy(child);
        }
      }
    }
    return copy;
  };
  treeProto.add = add_default;
  treeProto.addAll = addAll;
  treeProto.cover = cover_default;
  treeProto.data = data_default;
  treeProto.extent = extent_default;
  treeProto.find = find_default;
  treeProto.remove = remove_default;
  treeProto.removeAll = removeAll;
  treeProto.root = root_default;
  treeProto.size = size_default;
  treeProto.visit = visit_default;
  treeProto.visitAfter = visitAfter_default;
  treeProto.x = x_default;
  treeProto.y = y_default;

  // node_modules/d3-force/src/constant.js
  function constant_default(x3) {
    return function() {
      return x3;
    };
  }

  // node_modules/d3-force/src/jiggle.js
  function jiggle_default(random) {
    return (random() - 0.5) * 1e-6;
  }

  // node_modules/d3-force/src/collide.js
  function x(d) {
    return d.x + d.vx;
  }
  function y(d) {
    return d.y + d.vy;
  }
  function collide_default(radius) {
    var nodes, radii, random, strength = 1, iterations = 1;
    if (typeof radius !== "function")
      radius = constant_default(radius == null ? 1 : +radius);
    function force() {
      var i, n = nodes.length, tree, node, xi, yi, ri, ri2;
      for (var k = 0; k < iterations; ++k) {
        tree = quadtree(nodes, x, y).visitAfter(prepare);
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          ri = radii[node.index], ri2 = ri * ri;
          xi = node.x + node.vx;
          yi = node.y + node.vy;
          tree.visit(apply);
        }
      }
      function apply(quad, x0, y0, x1, y1) {
        var data = quad.data, rj = quad.r, r = ri + rj;
        if (data) {
          if (data.index > node.index) {
            var x3 = xi - data.x - data.vx, y3 = yi - data.y - data.vy, l = x3 * x3 + y3 * y3;
            if (l < r * r) {
              if (x3 === 0)
                x3 = jiggle_default(random), l += x3 * x3;
              if (y3 === 0)
                y3 = jiggle_default(random), l += y3 * y3;
              l = (r - (l = Math.sqrt(l))) / l * strength;
              node.vx += (x3 *= l) * (r = (rj *= rj) / (ri2 + rj));
              node.vy += (y3 *= l) * r;
              data.vx -= x3 * (r = 1 - r);
              data.vy -= y3 * r;
            }
          }
          return;
        }
        return x0 > xi + r || x1 < xi - r || y0 > yi + r || y1 < yi - r;
      }
    }
    function prepare(quad) {
      if (quad.data)
        return quad.r = radii[quad.data.index];
      for (var i = quad.r = 0; i < 4; ++i) {
        if (quad[i] && quad[i].r > quad.r) {
          quad.r = quad[i].r;
        }
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, node;
      radii = new Array(n);
      for (i = 0; i < n; ++i)
        node = nodes[i], radii[node.index] = +radius(node, i, nodes);
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.iterations = function(_) {
      return arguments.length ? (iterations = +_, force) : iterations;
    };
    force.strength = function(_) {
      return arguments.length ? (strength = +_, force) : strength;
    };
    force.radius = function(_) {
      return arguments.length ? (radius = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : radius;
    };
    return force;
  }

  // node_modules/d3-force/src/link.js
  function index(d) {
    return d.index;
  }
  function find(nodeById, nodeId) {
    var node = nodeById.get(nodeId);
    if (!node)
      throw new Error("node not found: " + nodeId);
    return node;
  }
  function link_default(links) {
    var id = index, strength = defaultStrength, strengths, distance = constant_default(30), distances, nodes, count, bias, random, iterations = 1;
    if (links == null)
      links = [];
    function defaultStrength(link) {
      return 1 / Math.min(count[link.source.index], count[link.target.index]);
    }
    function force(alpha) {
      for (var k = 0, n = links.length; k < iterations; ++k) {
        for (var i = 0, link, source, target, x3, y3, l, b; i < n; ++i) {
          link = links[i], source = link.source, target = link.target;
          x3 = target.x + target.vx - source.x - source.vx || jiggle_default(random);
          y3 = target.y + target.vy - source.y - source.vy || jiggle_default(random);
          l = Math.sqrt(x3 * x3 + y3 * y3);
          l = (l - distances[i]) / l * alpha * strengths[i];
          x3 *= l, y3 *= l;
          target.vx -= x3 * (b = bias[i]);
          target.vy -= y3 * b;
          source.vx += x3 * (b = 1 - b);
          source.vy += y3 * b;
        }
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, m2 = links.length, nodeById = new Map(nodes.map((d, i2) => [id(d, i2, nodes), d])), link;
      for (i = 0, count = new Array(n); i < m2; ++i) {
        link = links[i], link.index = i;
        if (typeof link.source !== "object")
          link.source = find(nodeById, link.source);
        if (typeof link.target !== "object")
          link.target = find(nodeById, link.target);
        count[link.source.index] = (count[link.source.index] || 0) + 1;
        count[link.target.index] = (count[link.target.index] || 0) + 1;
      }
      for (i = 0, bias = new Array(m2); i < m2; ++i) {
        link = links[i], bias[i] = count[link.source.index] / (count[link.source.index] + count[link.target.index]);
      }
      strengths = new Array(m2), initializeStrength();
      distances = new Array(m2), initializeDistance();
    }
    function initializeStrength() {
      if (!nodes)
        return;
      for (var i = 0, n = links.length; i < n; ++i) {
        strengths[i] = +strength(links[i], i, links);
      }
    }
    function initializeDistance() {
      if (!nodes)
        return;
      for (var i = 0, n = links.length; i < n; ++i) {
        distances[i] = +distance(links[i], i, links);
      }
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.links = function(_) {
      return arguments.length ? (links = _, initialize(), force) : links;
    };
    force.id = function(_) {
      return arguments.length ? (id = _, force) : id;
    };
    force.iterations = function(_) {
      return arguments.length ? (iterations = +_, force) : iterations;
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default(+_), initializeStrength(), force) : strength;
    };
    force.distance = function(_) {
      return arguments.length ? (distance = typeof _ === "function" ? _ : constant_default(+_), initializeDistance(), force) : distance;
    };
    return force;
  }

  // node_modules/d3-dispatch/src/dispatch.js
  var noop = { value: () => {
  } };
  function dispatch() {
    for (var i = 0, n = arguments.length, _ = {}, t; i < n; ++i) {
      if (!(t = arguments[i] + "") || t in _ || /[\s.]/.test(t))
        throw new Error("illegal type: " + t);
      _[t] = [];
    }
    return new Dispatch(_);
  }
  function Dispatch(_) {
    this._ = _;
  }
  function parseTypenames(typenames, types) {
    return typenames.trim().split(/^|\s+/).map(function(t) {
      var name = "", i = t.indexOf(".");
      if (i >= 0)
        name = t.slice(i + 1), t = t.slice(0, i);
      if (t && !types.hasOwnProperty(t))
        throw new Error("unknown type: " + t);
      return { type: t, name };
    });
  }
  Dispatch.prototype = dispatch.prototype = {
    constructor: Dispatch,
    on: function(typename, callback) {
      var _ = this._, T = parseTypenames(typename + "", _), t, i = -1, n = T.length;
      if (arguments.length < 2) {
        while (++i < n)
          if ((t = (typename = T[i]).type) && (t = get(_[t], typename.name)))
            return t;
        return;
      }
      if (callback != null && typeof callback !== "function")
        throw new Error("invalid callback: " + callback);
      while (++i < n) {
        if (t = (typename = T[i]).type)
          _[t] = set(_[t], typename.name, callback);
        else if (callback == null)
          for (t in _)
            _[t] = set(_[t], typename.name, null);
      }
      return this;
    },
    copy: function() {
      var copy = {}, _ = this._;
      for (var t in _)
        copy[t] = _[t].slice();
      return new Dispatch(copy);
    },
    call: function(type, that) {
      if ((n = arguments.length - 2) > 0)
        for (var args = new Array(n), i = 0, n, t; i < n; ++i)
          args[i] = arguments[i + 2];
      if (!this._.hasOwnProperty(type))
        throw new Error("unknown type: " + type);
      for (t = this._[type], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    },
    apply: function(type, that, args) {
      if (!this._.hasOwnProperty(type))
        throw new Error("unknown type: " + type);
      for (var t = this._[type], i = 0, n = t.length; i < n; ++i)
        t[i].value.apply(that, args);
    }
  };
  function get(type, name) {
    for (var i = 0, n = type.length, c2; i < n; ++i) {
      if ((c2 = type[i]).name === name) {
        return c2.value;
      }
    }
  }
  function set(type, name, callback) {
    for (var i = 0, n = type.length; i < n; ++i) {
      if (type[i].name === name) {
        type[i] = noop, type = type.slice(0, i).concat(type.slice(i + 1));
        break;
      }
    }
    if (callback != null)
      type.push({ name, value: callback });
    return type;
  }
  var dispatch_default = dispatch;

  // node_modules/d3-timer/src/timer.js
  var frame = 0;
  var timeout = 0;
  var interval = 0;
  var pokeDelay = 1e3;
  var taskHead;
  var taskTail;
  var clockLast = 0;
  var clockNow = 0;
  var clockSkew = 0;
  var clock = typeof performance === "object" && performance.now ? performance : Date;
  var setFrame = typeof window === "object" && window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : function(f) {
    setTimeout(f, 17);
  };
  function now() {
    return clockNow || (setFrame(clearNow), clockNow = clock.now() + clockSkew);
  }
  function clearNow() {
    clockNow = 0;
  }
  function Timer() {
    this._call = this._time = this._next = null;
  }
  Timer.prototype = timer.prototype = {
    constructor: Timer,
    restart: function(callback, delay, time) {
      if (typeof callback !== "function")
        throw new TypeError("callback is not a function");
      time = (time == null ? now() : +time) + (delay == null ? 0 : +delay);
      if (!this._next && taskTail !== this) {
        if (taskTail)
          taskTail._next = this;
        else
          taskHead = this;
        taskTail = this;
      }
      this._call = callback;
      this._time = time;
      sleep();
    },
    stop: function() {
      if (this._call) {
        this._call = null;
        this._time = Infinity;
        sleep();
      }
    }
  };
  function timer(callback, delay, time) {
    var t = new Timer();
    t.restart(callback, delay, time);
    return t;
  }
  function timerFlush() {
    now();
    ++frame;
    var t = taskHead, e;
    while (t) {
      if ((e = clockNow - t._time) >= 0)
        t._call.call(void 0, e);
      t = t._next;
    }
    --frame;
  }
  function wake() {
    clockNow = (clockLast = clock.now()) + clockSkew;
    frame = timeout = 0;
    try {
      timerFlush();
    } finally {
      frame = 0;
      nap();
      clockNow = 0;
    }
  }
  function poke() {
    var now2 = clock.now(), delay = now2 - clockLast;
    if (delay > pokeDelay)
      clockSkew -= delay, clockLast = now2;
  }
  function nap() {
    var t0, t1 = taskHead, t2, time = Infinity;
    while (t1) {
      if (t1._call) {
        if (time > t1._time)
          time = t1._time;
        t0 = t1, t1 = t1._next;
      } else {
        t2 = t1._next, t1._next = null;
        t1 = t0 ? t0._next = t2 : taskHead = t2;
      }
    }
    taskTail = t0;
    sleep(time);
  }
  function sleep(time) {
    if (frame)
      return;
    if (timeout)
      timeout = clearTimeout(timeout);
    var delay = time - clockNow;
    if (delay > 24) {
      if (time < Infinity)
        timeout = setTimeout(wake, time - clock.now() - clockSkew);
      if (interval)
        interval = clearInterval(interval);
    } else {
      if (!interval)
        clockLast = clock.now(), interval = setInterval(poke, pokeDelay);
      frame = 1, setFrame(wake);
    }
  }

  // node_modules/d3-force/src/lcg.js
  var a = 1664525;
  var c = 1013904223;
  var m = 4294967296;
  function lcg_default() {
    let s = 1;
    return () => (s = (a * s + c) % m) / m;
  }

  // node_modules/d3-force/src/simulation.js
  function x2(d) {
    return d.x;
  }
  function y2(d) {
    return d.y;
  }
  var initialRadius = 10;
  var initialAngle = Math.PI * (3 - Math.sqrt(5));
  function simulation_default(nodes) {
    var simulation2, alpha = 1, alphaMin = 1e-3, alphaDecay = 1 - Math.pow(alphaMin, 1 / 300), alphaTarget = 0, velocityDecay = 0.6, forces = /* @__PURE__ */ new Map(), stepper = timer(step), event = dispatch_default("tick", "end"), random = lcg_default();
    if (nodes == null)
      nodes = [];
    function step() {
      tick();
      event.call("tick", simulation2);
      if (alpha < alphaMin) {
        stepper.stop();
        event.call("end", simulation2);
      }
    }
    function tick(iterations) {
      var i, n = nodes.length, node;
      if (iterations === void 0)
        iterations = 1;
      for (var k = 0; k < iterations; ++k) {
        alpha += (alphaTarget - alpha) * alphaDecay;
        forces.forEach(function(force) {
          force(alpha);
        });
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          if (node.fx == null)
            node.x += node.vx *= velocityDecay;
          else
            node.x = node.fx, node.vx = 0;
          if (node.fy == null)
            node.y += node.vy *= velocityDecay;
          else
            node.y = node.fy, node.vy = 0;
        }
      }
      return simulation2;
    }
    function initializeNodes() {
      for (var i = 0, n = nodes.length, node; i < n; ++i) {
        node = nodes[i], node.index = i;
        if (node.fx != null)
          node.x = node.fx;
        if (node.fy != null)
          node.y = node.fy;
        if (isNaN(node.x) || isNaN(node.y)) {
          var radius = initialRadius * Math.sqrt(0.5 + i), angle = i * initialAngle;
          node.x = radius * Math.cos(angle);
          node.y = radius * Math.sin(angle);
        }
        if (isNaN(node.vx) || isNaN(node.vy)) {
          node.vx = node.vy = 0;
        }
      }
    }
    function initializeForce(force) {
      if (force.initialize)
        force.initialize(nodes, random);
      return force;
    }
    initializeNodes();
    return simulation2 = {
      tick,
      restart: function() {
        return stepper.restart(step), simulation2;
      },
      stop: function() {
        return stepper.stop(), simulation2;
      },
      nodes: function(_) {
        return arguments.length ? (nodes = _, initializeNodes(), forces.forEach(initializeForce), simulation2) : nodes;
      },
      alpha: function(_) {
        return arguments.length ? (alpha = +_, simulation2) : alpha;
      },
      alphaMin: function(_) {
        return arguments.length ? (alphaMin = +_, simulation2) : alphaMin;
      },
      alphaDecay: function(_) {
        return arguments.length ? (alphaDecay = +_, simulation2) : +alphaDecay;
      },
      alphaTarget: function(_) {
        return arguments.length ? (alphaTarget = +_, simulation2) : alphaTarget;
      },
      velocityDecay: function(_) {
        return arguments.length ? (velocityDecay = 1 - _, simulation2) : 1 - velocityDecay;
      },
      randomSource: function(_) {
        return arguments.length ? (random = _, forces.forEach(initializeForce), simulation2) : random;
      },
      force: function(name, _) {
        return arguments.length > 1 ? (_ == null ? forces.delete(name) : forces.set(name, initializeForce(_)), simulation2) : forces.get(name);
      },
      find: function(x3, y3, radius) {
        var i = 0, n = nodes.length, dx, dy, d2, node, closest;
        if (radius == null)
          radius = Infinity;
        else
          radius *= radius;
        for (i = 0; i < n; ++i) {
          node = nodes[i];
          dx = x3 - node.x;
          dy = y3 - node.y;
          d2 = dx * dx + dy * dy;
          if (d2 < radius)
            closest = node, radius = d2;
        }
        return closest;
      },
      on: function(name, _) {
        return arguments.length > 1 ? (event.on(name, _), simulation2) : event.on(name);
      }
    };
  }

  // node_modules/d3-force/src/manyBody.js
  function manyBody_default() {
    var nodes, node, random, alpha, strength = constant_default(-30), strengths, distanceMin2 = 1, distanceMax2 = Infinity, theta2 = 0.81;
    function force(_) {
      var i, n = nodes.length, tree = quadtree(nodes, x2, y2).visitAfter(accumulate);
      for (alpha = _, i = 0; i < n; ++i)
        node = nodes[i], tree.visit(apply);
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length, node2;
      strengths = new Array(n);
      for (i = 0; i < n; ++i)
        node2 = nodes[i], strengths[node2.index] = +strength(node2, i, nodes);
    }
    function accumulate(quad) {
      var strength2 = 0, q, c2, weight = 0, x3, y3, i;
      if (quad.length) {
        for (x3 = y3 = i = 0; i < 4; ++i) {
          if ((q = quad[i]) && (c2 = Math.abs(q.value))) {
            strength2 += q.value, weight += c2, x3 += c2 * q.x, y3 += c2 * q.y;
          }
        }
        quad.x = x3 / weight;
        quad.y = y3 / weight;
      } else {
        q = quad;
        q.x = q.data.x;
        q.y = q.data.y;
        do
          strength2 += strengths[q.data.index];
        while (q = q.next);
      }
      quad.value = strength2;
    }
    function apply(quad, x1, _, x22) {
      if (!quad.value)
        return true;
      var x3 = quad.x - node.x, y3 = quad.y - node.y, w = x22 - x1, l = x3 * x3 + y3 * y3;
      if (w * w / theta2 < l) {
        if (l < distanceMax2) {
          if (x3 === 0)
            x3 = jiggle_default(random), l += x3 * x3;
          if (y3 === 0)
            y3 = jiggle_default(random), l += y3 * y3;
          if (l < distanceMin2)
            l = Math.sqrt(distanceMin2 * l);
          node.vx += x3 * quad.value * alpha / l;
          node.vy += y3 * quad.value * alpha / l;
        }
        return true;
      } else if (quad.length || l >= distanceMax2)
        return;
      if (quad.data !== node || quad.next) {
        if (x3 === 0)
          x3 = jiggle_default(random), l += x3 * x3;
        if (y3 === 0)
          y3 = jiggle_default(random), l += y3 * y3;
        if (l < distanceMin2)
          l = Math.sqrt(distanceMin2 * l);
      }
      do
        if (quad.data !== node) {
          w = strengths[quad.data.index] * alpha / l;
          node.vx += x3 * w;
          node.vy += y3 * w;
        }
      while (quad = quad.next);
    }
    force.initialize = function(_nodes, _random) {
      nodes = _nodes;
      random = _random;
      initialize();
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : strength;
    };
    force.distanceMin = function(_) {
      return arguments.length ? (distanceMin2 = _ * _, force) : Math.sqrt(distanceMin2);
    };
    force.distanceMax = function(_) {
      return arguments.length ? (distanceMax2 = _ * _, force) : Math.sqrt(distanceMax2);
    };
    force.theta = function(_) {
      return arguments.length ? (theta2 = _ * _, force) : Math.sqrt(theta2);
    };
    return force;
  }

  // node_modules/d3-force/src/x.js
  function x_default2(x3) {
    var strength = constant_default(0.1), nodes, strengths, xz;
    if (typeof x3 !== "function")
      x3 = constant_default(x3 == null ? 0 : +x3);
    function force(alpha) {
      for (var i = 0, n = nodes.length, node; i < n; ++i) {
        node = nodes[i], node.vx += (xz[i] - node.x) * strengths[i] * alpha;
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length;
      strengths = new Array(n);
      xz = new Array(n);
      for (i = 0; i < n; ++i) {
        strengths[i] = isNaN(xz[i] = +x3(nodes[i], i, nodes)) ? 0 : +strength(nodes[i], i, nodes);
      }
    }
    force.initialize = function(_) {
      nodes = _;
      initialize();
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : strength;
    };
    force.x = function(_) {
      return arguments.length ? (x3 = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : x3;
    };
    return force;
  }

  // node_modules/d3-force/src/y.js
  function y_default2(y3) {
    var strength = constant_default(0.1), nodes, strengths, yz;
    if (typeof y3 !== "function")
      y3 = constant_default(y3 == null ? 0 : +y3);
    function force(alpha) {
      for (var i = 0, n = nodes.length, node; i < n; ++i) {
        node = nodes[i], node.vy += (yz[i] - node.y) * strengths[i] * alpha;
      }
    }
    function initialize() {
      if (!nodes)
        return;
      var i, n = nodes.length;
      strengths = new Array(n);
      yz = new Array(n);
      for (i = 0; i < n; ++i) {
        strengths[i] = isNaN(yz[i] = +y3(nodes[i], i, nodes)) ? 0 : +strength(nodes[i], i, nodes);
      }
    }
    force.initialize = function(_) {
      nodes = _;
      initialize();
    };
    force.strength = function(_) {
      return arguments.length ? (strength = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : strength;
    };
    force.y = function(_) {
      return arguments.length ? (y3 = typeof _ === "function" ? _ : constant_default(+_), initialize(), force) : y3;
    };
    return force;
  }

  // webview/app.ts
  var vscode = acquireVsCodeApi();
  var initialView = document.getElementById("initialView");
  var loadingView = document.getElementById("loadingView");
  var loadingText = document.getElementById("loadingText");
  var loadingSubtext = document.getElementById("loadingSubtext");
  var activeView = document.getElementById("activeView");
  var errorView = document.getElementById("errorView");
  var errorMessage = document.getElementById("errorMessage");
  var errorDetails = document.getElementById("errorDetails");
  var badgeDot = document.getElementById("badgeDot");
  var badgeText = document.getElementById("badgeText");
  var stepChip = document.getElementById("stepChip");
  var graphViewport = document.getElementById("graphViewport");
  var graphCanvas = document.getElementById("graphCanvas");
  var arrowsSvg = document.getElementById("arrowsSvg");
  var arrowsGroup = document.getElementById("arrowsGroup");
  var nodesLayer = document.getElementById("nodesLayer");
  var explanationText = document.getElementById("explanationText");
  var terminalPlaceholder = document.getElementById("terminalPlaceholder");
  var terminalText = document.getElementById("terminalText");
  var btnClearTerminal = document.getElementById("btnClearTerminal");
  function updateTerminal(output) {
    if (output && output.length > 0) {
      if (terminalPlaceholder)
        terminalPlaceholder.style.display = "none";
      if (terminalText) {
        terminalText.style.display = "block";
        terminalText.textContent = output;
      }
      const vp = document.getElementById("terminalViewport");
      if (vp)
        vp.scrollTop = vp.scrollHeight;
    } else {
      if (terminalPlaceholder)
        terminalPlaceholder.style.display = "inline";
      if (terminalText) {
        terminalText.style.display = "none";
        terminalText.textContent = "";
      }
    }
  }
  if (btnClearTerminal) {
    btnClearTerminal.addEventListener("click", () => {
      updateTerminal("");
    });
  }
  var btnInitialVisualize = document.getElementById("btnInitialVisualize");
  var btnPrev = document.getElementById("btnPrev");
  var btnNext = document.getElementById("btnNext");
  var btnRestart = document.getElementById("btnRestart");
  var btnRetry = document.getElementById("btnRetry");
  var btnResetLayout = document.getElementById("btnResetLayout");
  var nodePositions = /* @__PURE__ */ new Map();
  var currentSnapshot = null;
  var simulation = null;
  var d3NodesMap = /* @__PURE__ */ new Map();
  var d3Links = [];
  function onSimulationTick() {
    for (const node of d3NodesMap.values()) {
      if (node.x !== void 0 && node.y !== void 0) {
        const actualWidth = node.el.offsetWidth > 0 ? node.el.offsetWidth : node.width;
        const actualHeight = node.el.offsetHeight > 0 ? node.el.offsetHeight : node.height;
        node.width = actualWidth;
        node.height = actualHeight;
        node.radius = Math.min(actualWidth, actualHeight) / 2 + 6;
        const left = Math.max(8, node.x - actualWidth / 2);
        const top = Math.max(8, node.y - actualHeight / 2);
        node.el.style.left = `${left}px`;
        node.el.style.top = `${top}px`;
        nodePositions.set(node.id, {
          x: left,
          y: top,
          width: actualWidth,
          height: actualHeight
        });
      }
    }
    renderArrows();
  }
  function initOrUpdateSimulation(nodes, links, isReset = false) {
    if (!simulation) {
      simulation = simulation_default(nodes).force(
        "link",
        link_default(links).id((d) => d.id).distance((l) => l.distance).strength((l) => l.strength)
      ).force(
        "charge",
        manyBody_default().strength((d) => d.nodeType === "node" ? -220 : -90).distanceMax(380)
      ).force(
        "collide",
        collide_default().radius((d) => d.radius + 10).iterations(3)
      ).force(
        "centerX",
        x_default2().x((d) => d.targetX).strength(0.025)
      ).force(
        "centerY",
        y_default2().y((d) => d.targetY).strength(0.025)
      ).velocityDecay(0.32).alphaDecay(0.018);
      simulation.on("tick", onSimulationTick);
    } else {
      simulation.nodes(nodes);
      const linkForce = simulation.force("link");
      if (linkForce) {
        linkForce.links(links);
      }
    }
    if (isReset) {
      simulation.alpha(1).restart();
    } else {
      simulation.alpha(0.6).restart();
    }
  }
  function registerD3Node(id, el, targetCenterX, targetCenterY, fallbackWidth, fallbackHeight, nodeType, reset = false) {
    let node = d3NodesMap.get(id);
    const width = el.offsetWidth > 0 ? el.offsetWidth : fallbackWidth;
    const height = el.offsetHeight > 0 ? el.offsetHeight : fallbackHeight;
    const radius = Math.min(width, height) / 2 + 6;
    if (!node || reset) {
      const initialY = reset ? targetCenterY : targetCenterY - 14;
      node = {
        id,
        el,
        width,
        height,
        radius,
        targetX: targetCenterX,
        targetY: targetCenterY,
        nodeType,
        x: targetCenterX,
        y: initialY,
        vx: 0,
        vy: reset ? 0 : 1.2,
        fx: null,
        fy: null
      };
      d3NodesMap.set(id, node);
    } else {
      node.el = el;
      node.width = width;
      node.height = height;
      node.radius = radius;
      node.targetX = targetCenterX;
      node.targetY = targetCenterY;
      node.nodeType = nodeType;
    }
    const posX = node.x !== void 0 ? node.x : targetCenterX;
    const posY = node.y !== void 0 ? node.y : targetCenterY;
    const left = posX - width / 2;
    const top = posY - height / 2;
    node.el.style.left = `${left}px`;
    node.el.style.top = `${top}px`;
    nodePositions.set(id, { x: left, y: top, width, height });
    return node;
  }
  function formatMemoryAddress(addr, fallbackId) {
    if (!addr)
      return fallbackId || "0x0";
    const match = addr.match(/0x0*([0-9a-fA-F]+)/);
    if (match) {
      return `0x${match[1].toLowerCase()}`;
    }
    return addr;
  }
  function getNextAddressDisplay(node) {
    if (node.nextId) {
      const target = currentSnapshot?.nodes.find((n) => n.id === node.nextId);
      if (target?.address) {
        return formatMemoryAddress(target.address, "nullptr");
      }
      return node.nextId;
    }
    if (node.nextAddress && currentSnapshot?.nodes.some((n) => n.address === node.nextAddress)) {
      return formatMemoryAddress(node.nextAddress, "nullptr");
    }
    return "nullptr";
  }
  var cameraPanX = 0;
  var cameraPanY = 0;
  var cameraZoom = 1;
  var isPanning = false;
  var startPanClientX = 0;
  var startPanClientY = 0;
  var initialPanX = 0;
  var initialPanY = 0;
  var isSpacePressed = false;
  function applyCameraTransform(smooth = false) {
    if (smooth) {
      graphCanvas.style.transition = "transform 0.25s cubic-bezier(0.2, 0, 0, 1)";
      setTimeout(() => {
        graphCanvas.style.transition = "none";
      }, 260);
    } else {
      graphCanvas.style.transition = "none";
    }
    graphCanvas.style.transformOrigin = "0 0";
    graphCanvas.style.transform = `translate(${cameraPanX}px, ${cameraPanY}px) scale(${cameraZoom})`;
    const gridSize = 16 * cameraZoom;
    graphViewport.style.backgroundSize = `${gridSize}px ${gridSize}px`;
    graphViewport.style.backgroundPosition = `${cameraPanX}px ${cameraPanY}px`;
  }
  function resetCameraView(smooth = true) {
    cameraPanX = 0;
    cameraPanY = 0;
    cameraZoom = 1;
    applyCameraTransform(smooth);
  }
  function showView(view) {
    initialView.style.display = view === "initial" ? "flex" : "none";
    loadingView.style.display = view === "loading" ? "flex" : "none";
    activeView.style.display = view === "active" ? "block" : "none";
    errorView.style.display = view === "error" ? "flex" : "none";
    btnRestart.style.display = view === "active" || view === "error" ? "inline-flex" : "none";
  }
  function updateBadge(status) {
    badgeDot.className = "badge-dot";
    if (status === "paused") {
      badgeDot.classList.add("active");
      badgeText.textContent = "Paused";
    } else if (status === "running") {
      badgeDot.classList.add("running");
      badgeText.textContent = "Running";
    } else if (status === "error") {
      badgeDot.classList.add("error");
      badgeText.textContent = "Error";
    } else if (status === "terminated") {
      badgeText.textContent = "Terminated";
    } else {
      badgeText.textContent = "Idle";
    }
  }
  function makeDraggable(el, id) {
    el.onpointerdown = (e) => {
      if (e.button !== 0 || isSpacePressed)
        return;
      e.preventDefault();
      e.stopPropagation();
      const d3Node = d3NodesMap.get(id);
      if (!d3Node || !simulation)
        return;
      el.setPointerCapture(e.pointerId);
      el.classList.add("dragging");
      simulation.alphaTarget(0.5).restart();
      d3Node.fx = d3Node.x;
      d3Node.fy = d3Node.y;
      const startMouseX = e.clientX;
      const startMouseY = e.clientY;
      const startNodeCenterX = d3Node.x;
      const startNodeCenterY = d3Node.y;
      const onPointerMove = (moveEv) => {
        const dx = (moveEv.clientX - startMouseX) / cameraZoom;
        const dy = (moveEv.clientY - startMouseY) / cameraZoom;
        d3Node.fx = Math.max(d3Node.width / 2 + 8, startNodeCenterX + dx);
        d3Node.fy = Math.max(d3Node.height / 2 + 8, startNodeCenterY + dy);
        d3Node.targetX = d3Node.fx;
        d3Node.targetY = d3Node.fy;
      };
      const onPointerUp = (upEv) => {
        try {
          el.releasePointerCapture(upEv.pointerId);
        } catch {
        }
        el.classList.remove("dragging");
        if (d3Node.x !== void 0 && d3Node.y !== void 0) {
          d3Node.targetX = d3Node.x;
          d3Node.targetY = d3Node.y;
        }
        d3Node.fx = null;
        d3Node.fy = null;
        simulation.alphaTarget(0);
        simulation.alpha(0.6).restart();
        el.removeEventListener("pointermove", onPointerMove);
        el.removeEventListener("pointerup", onPointerUp);
        el.removeEventListener("pointercancel", onPointerUp);
      };
      el.addEventListener("pointermove", onPointerMove);
      el.addEventListener("pointerup", onPointerUp);
      el.addEventListener("pointercancel", onPointerUp);
    };
  }
  function getPerimeterIntersection(rect, targetCenter) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const dx = targetCenter.x - cx;
    const dy = targetCenter.y - cy;
    if (Math.abs(dx) < 1e-3 && Math.abs(dy) < 1e-3) {
      return { x: cx + rect.width / 2, y: cy, nx: 1, ny: 0 };
    }
    const halfW = rect.width / 2;
    const halfH = rect.height / 2;
    const tx = halfW / Math.abs(dx);
    const ty = halfH / Math.abs(dy);
    if (tx <= ty) {
      const signX = dx > 0 ? 1 : -1;
      return {
        x: cx + signX * halfW,
        y: cy + dy * tx,
        nx: signX,
        ny: 0
      };
    } else {
      const signY = dy > 0 ? 1 : -1;
      return {
        x: cx + dx * ty,
        y: cy + signY * halfH,
        nx: 0,
        ny: signY
      };
    }
  }
  function getCapsulePerimeter(rect, target) {
    const cx = rect.x + rect.width / 2;
    const cy = rect.y + rect.height / 2;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const dist = Math.hypot(dx, dy);
    if (dist < 1e-3) {
      return { x: cx + rect.width / 2, y: cy, nx: 1, ny: 0 };
    }
    if (rect.width >= rect.height) {
      const R = rect.height / 2;
      const straightHalfW = Math.max(0, rect.width / 2 - R);
      if (Math.abs(dy) > 1e-3 && Math.abs(dx) * R <= straightHalfW * Math.abs(dy)) {
        const signY = dy > 0 ? 1 : -1;
        const t = R / Math.abs(dy);
        return {
          x: cx + dx * t,
          y: cy + signY * R,
          nx: 0,
          ny: signY
        };
      }
      const signX = dx >= 0 ? 1 : -1;
      const capCenterX = cx + signX * straightHalfW;
      const capCenterY = cy;
      const capDx = target.x - capCenterX;
      const capDy = target.y - capCenterY;
      const capDist = Math.hypot(capDx, capDy) || 1;
      const nx = capDx / capDist;
      const ny = capDy / capDist;
      return {
        x: capCenterX + nx * R,
        y: capCenterY + ny * R,
        nx,
        ny
      };
    } else {
      const R = rect.width / 2;
      const straightHalfH = Math.max(0, rect.height / 2 - R);
      if (Math.abs(dx) > 1e-3 && Math.abs(dy) * R <= straightHalfH * Math.abs(dx)) {
        const signX = dx > 0 ? 1 : -1;
        const t = R / Math.abs(dx);
        return {
          x: cx + signX * R,
          y: cy + dy * t,
          nx: signX,
          ny: 0
        };
      }
      const signY = dy >= 0 ? 1 : -1;
      const capCenterX = cx;
      const capCenterY = cy + signY * straightHalfH;
      const capDx = target.x - capCenterX;
      const capDy = target.y - capCenterY;
      const capDist = Math.hypot(capDx, capDy) || 1;
      const nx = capDx / capDist;
      const ny = capDy / capDist;
      return {
        x: capCenterX + nx * R,
        y: capCenterY + ny * R,
        nx,
        ny
      };
    }
  }
  function getCirclePerimeterIntersection(circleCenter, radius, targetPoint) {
    const dx = targetPoint.x - circleCenter.x;
    const dy = targetPoint.y - circleCenter.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    return {
      x: circleCenter.x + nx * radius,
      y: circleCenter.y + ny * radius,
      nx,
      ny
    };
  }
  function drawBezierArrow(startX, startY, startNx, startNy, endX, endY, endOutwardNx, endOutwardNy, isMuted = false, color = "#0066FF") {
    const dist = Math.hypot(endX - startX, endY - startY);
    const curvature = Math.max(16, Math.min(80, dist * 0.38));
    const cp1x = startX + startNx * curvature;
    const cp1y = startY + startNy * curvature;
    const cp2x = endX + endOutwardNx * curvature;
    const cp2y = endY + endOutwardNy * curvature;
    const d = `M ${startX} ${startY} C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${endX} ${endY}`;
    const pathEl = document.createElementNS("http://www.w3.org/2000/svg", "path");
    pathEl.setAttribute("d", d);
    pathEl.setAttribute("stroke", isMuted ? "#737D8C" : color);
    pathEl.setAttribute("stroke-width", "1.8");
    pathEl.setAttribute("stroke-linecap", "butt");
    pathEl.setAttribute("fill", "none");
    let marker = "url(#arrowHead)";
    if (isMuted) {
      marker = "url(#arrowHeadMuted)";
    } else if (color === "#36C779") {
      marker = "url(#arrowHeadGreen)";
    }
    pathEl.setAttribute("marker-end", marker);
    if (arrowsGroup) {
      arrowsGroup.appendChild(pathEl);
    } else {
      arrowsSvg.appendChild(pathEl);
    }
  }
  function renderArrows() {
    if (arrowsGroup) {
      arrowsGroup.innerHTML = "";
    } else {
      const paths = arrowsSvg.querySelectorAll(":scope > path");
      paths.forEach((p) => p.remove());
    }
    if (!currentSnapshot || !currentSnapshot.hasHead)
      return;
    for (const ptr of currentSnapshot.pointers || []) {
      const badgeId = `badge-ptr-${ptr.name}`;
      const badgePos = nodePositions.get(badgeId);
      if (!badgePos)
        continue;
      if (ptr.targetNodeId && nodePositions.has(ptr.targetNodeId)) {
        const targetPos = nodePositions.get(ptr.targetNodeId);
        const centerA = { x: badgePos.x + badgePos.width / 2, y: badgePos.y + badgePos.height / 2 };
        const centerB = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
        const start = getCapsulePerimeter(badgePos, centerB);
        const end = currentSnapshot.structureType === "tree" ? getCirclePerimeterIntersection(centerB, targetPos.width / 2, centerA) : getPerimeterIntersection(targetPos, centerA);
        const isHead = ptr.name === "head" || ptr.name === "root";
        drawBezierArrow(
          start.x,
          start.y,
          start.nx,
          start.ny,
          end.x,
          end.y,
          end.nx,
          end.ny,
          false,
          isHead ? "#0066FF" : "#36C779"
        );
      } else if (ptr.isNull) {
        const nullId = `badge-null-${ptr.name}`;
        if (nodePositions.has(nullId)) {
          const nullPos = nodePositions.get(nullId);
          const centerA = { x: badgePos.x + badgePos.width / 2, y: badgePos.y + badgePos.height / 2 };
          const centerB = { x: nullPos.x + nullPos.width / 2, y: nullPos.y + nullPos.height / 2 };
          const start = getCapsulePerimeter(badgePos, centerB);
          const end = getPerimeterIntersection(nullPos, centerA);
          drawBezierArrow(
            start.x,
            start.y,
            start.nx,
            start.ny,
            end.x,
            end.y,
            end.nx,
            end.ny,
            true,
            "#737D8C"
          );
        }
      }
    }
    if (currentSnapshot.structureType === "tree") {
      for (const node of currentSnapshot.nodes) {
        const nodePos = nodePositions.get(node.id);
        if (!nodePos)
          continue;
        const pCenter = { x: nodePos.x + nodePos.width / 2, y: nodePos.y + nodePos.height / 2 };
        const pRadius = nodePos.width / 2;
        if (node.leftId && nodePositions.has(node.leftId)) {
          const targetPos = nodePositions.get(node.leftId);
          const cCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
          const cRadius = targetPos.width / 2;
          const start = getCirclePerimeterIntersection(pCenter, pRadius, cCenter);
          const end = getCirclePerimeterIntersection(cCenter, cRadius, pCenter);
          drawBezierArrow(
            start.x,
            start.y,
            start.nx,
            start.ny,
            end.x,
            end.y,
            end.nx,
            end.ny,
            false,
            "#0066FF"
          );
        }
        if (node.rightId && nodePositions.has(node.rightId)) {
          const targetPos = nodePositions.get(node.rightId);
          const cCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
          const cRadius = targetPos.width / 2;
          const start = getCirclePerimeterIntersection(pCenter, pRadius, cCenter);
          const end = getCirclePerimeterIntersection(cCenter, cRadius, pCenter);
          drawBezierArrow(
            start.x,
            start.y,
            start.nx,
            start.ny,
            end.x,
            end.y,
            end.nx,
            end.ny,
            false,
            "#0066FF"
          );
        }
      }
      return;
    }
    for (const node of currentSnapshot.nodes) {
      const nodePos = nodePositions.get(node.id);
      if (!nodePos)
        continue;
      const portX = nodePos.x + nodePos.width;
      const portY = nodePos.y + nodePos.height / 2;
      if (node.nextId && nodePositions.has(node.nextId)) {
        const targetPos = nodePositions.get(node.nextId);
        const targetCenter = { x: targetPos.x + targetPos.width / 2, y: targetPos.y + targetPos.height / 2 };
        const end = getPerimeterIntersection(targetPos, { x: portX, y: portY });
        const dx = targetCenter.x - portX;
        const dy = targetCenter.y - portY;
        const dist = Math.hypot(dx, dy) || 1;
        const startNx = targetCenter.x >= portX - 10 ? 1 : dx / dist;
        const startNy = targetCenter.x >= portX - 10 ? 0 : dy / dist;
        drawBezierArrow(
          portX,
          portY,
          startNx,
          startNy,
          end.x,
          end.y,
          end.nx,
          end.ny,
          false,
          "#0066FF"
        );
      } else if (nodePositions.has(`badge-null-${node.id}`)) {
        const nullPos = nodePositions.get(`badge-null-${node.id}`);
        const nullCenter = { x: nullPos.x + nullPos.width / 2, y: nullPos.y + nullPos.height / 2 };
        const end = getPerimeterIntersection(nullPos, { x: portX, y: portY });
        const dx = nullCenter.x - portX;
        const dy = nullCenter.y - portY;
        const dist = Math.hypot(dx, dy) || 1;
        const startNx = nullCenter.x >= portX - 10 ? 1 : dx / dist;
        const startNy = nullCenter.x >= portX - 10 ? 0 : dy / dist;
        drawBezierArrow(
          portX,
          portY,
          startNx,
          startNy,
          end.x,
          end.y,
          end.nx,
          end.ny,
          true,
          "#737D8C"
        );
      }
    }
  }
  function renderDiagram(snapshot, resetPositions = false) {
    currentSnapshot = snapshot;
    nodesLayer.innerHTML = "";
    d3Links = [];
    const activeIds = /* @__PURE__ */ new Set();
    if (resetPositions) {
      nodePositions.clear();
      d3NodesMap.clear();
    }
    const { headId, nodes } = snapshot;
    if (!snapshot.hasHead) {
      nodePositions.clear();
      d3NodesMap.clear();
      d3Links = [];
      if (arrowsGroup) {
        arrowsGroup.innerHTML = "";
      } else {
        const paths = arrowsSvg.querySelectorAll(":scope > path");
        paths.forEach((p) => p.remove());
      }
      const dsName = snapshot.structureType === "tree" ? "tree" : "linked list";
      const emptyMsg = document.createElement("div");
      emptyMsg.className = "empty-canvas-message";
      emptyMsg.innerHTML = `
      <div class="empty-icon">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#737D8C" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
        </svg>
      </div>
      <div class="empty-title">Canvas Empty</div>
      <div class="empty-subtitle">Program paused at entry.<br>Click <b>Next</b> to allocate and initialize the ${dsName}.</div>
    `;
      nodesLayer.appendChild(emptyMsg);
      if (simulation) {
        simulation.stop();
        simulation.nodes([]);
      }
      return;
    }
    const pointers = snapshot.pointers || [];
    for (let pIdx = 0; pIdx < pointers.length; pIdx++) {
      const ptr = pointers[pIdx];
      const badgeId = `badge-ptr-${ptr.name}`;
      activeIds.add(badgeId);
      const badgeEl = document.createElement("div");
      badgeEl.id = badgeId;
      const isHead = ptr.name === "head" || ptr.name === "root";
      badgeEl.className = `graph-badge-node ${isHead ? "head-badge" : "local-ptr-badge"}`;
      badgeEl.innerHTML = `<span>${ptr.name}</span>`;
      nodesLayer.appendChild(badgeEl);
      let targetCenterX = 85;
      let targetCenterY = 48;
      if (snapshot.structureType === "tree") {
        if (ptr.targetNodeId) {
          const targetNode = nodes.find((n) => n.id === ptr.targetNodeId);
          if (targetNode) {
            const col = targetNode.treeColumn !== void 0 ? targetNode.treeColumn : 0;
            const depth = targetNode.treeDepth !== void 0 ? targetNode.treeDepth : 0;
            const sameTargetPtrs = pointers.filter((p) => p.targetNodeId === ptr.targetNodeId);
            const sameIdx = sameTargetPtrs.indexOf(ptr);
            const sameCount = sameTargetPtrs.length;
            const offset = sameCount > 1 ? (sameIdx - (sameCount - 1) / 2) * 55 : 0;
            targetCenterX = 140 + col * 75 + offset;
            targetCenterY = 75 + depth * 85 - 42;
          }
        } else {
          targetCenterX = 140 + pIdx * 90;
          targetCenterY = 32;
        }
      } else if (!isHead) {
        if (ptr.name === "first") {
          targetCenterX = 85;
          targetCenterY = 145;
        } else if (ptr.name === "second") {
          targetCenterX = 345;
          targetCenterY = 48;
        } else if (ptr.name === "third") {
          targetCenterX = 510;
          targetCenterY = 48;
        } else {
          targetCenterX = 85 + pIdx * 95;
          targetCenterY = 220;
        }
      }
      registerD3Node(badgeId, badgeEl, targetCenterX, targetCenterY, 68, 26, "ptr", resetPositions);
      makeDraggable(badgeEl, badgeId);
      if (ptr.targetNodeId) {
        d3Links.push({
          source: badgeId,
          target: ptr.targetNodeId,
          distance: 95,
          strength: 0.75
        });
      }
      if (ptr.isNull) {
        const nullId = `badge-null-${ptr.name}`;
        activeIds.add(nullId);
        const nullBadge = document.createElement("div");
        nullBadge.id = nullId;
        nullBadge.className = "graph-badge-node null-badge-node";
        nullBadge.innerHTML = `<span class="null-glyph">\u2205</span><span class="null-text">nullptr</span>`;
        nodesLayer.appendChild(nullBadge);
        registerD3Node(nullId, nullBadge, targetCenterX + 100, targetCenterY, 78, 26, "null", resetPositions);
        makeDraggable(nullBadge, nullId);
        d3Links.push({
          source: badgeId,
          target: nullId,
          distance: 95,
          strength: 0.75
        });
      } else {
        nodePositions.delete(`badge-null-${ptr.name}`);
        d3NodesMap.delete(`badge-null-${ptr.name}`);
      }
    }
    if (snapshot.structureType === "tree") {
      const detachedNodes2 = nodes.filter((n) => n.isDetached);
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        activeIds.add(node.id);
        const nodeEl = document.createElement("div");
        nodeEl.id = `node-${node.id}`;
        nodeEl.className = "tree-node-card";
        if (node.isVisiting || node.id === snapshot.activeVisitingNodeId) {
          nodeEl.classList.add("visiting");
        }
        if (node.isNewlyConnected) {
          nodeEl.classList.add("new-connected");
        } else if (node.isNewlyCreated) {
          nodeEl.classList.add("new-created");
        }
        if (node.isDetached) {
          nodeEl.classList.add("detached");
        }
        nodeEl.innerHTML = `<span class="tree-node-val">${node.data}</span>`;
        nodesLayer.appendChild(nodeEl);
        let targetCenterX;
        let targetCenterY;
        if (node.isDetached) {
          const detachedIdx = detachedNodes2.indexOf(node);
          targetCenterX = 80 + detachedIdx * 65;
          targetCenterY = 320;
        } else {
          const col = node.treeColumn !== void 0 ? node.treeColumn : i;
          const depth = node.treeDepth !== void 0 ? node.treeDepth : 0;
          targetCenterX = 140 + col * 75;
          targetCenterY = 75 + depth * 85;
        }
        registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 46, 46, "node", resetPositions);
        makeDraggable(nodeEl, node.id);
        if (node.leftId && nodes.some((n) => n.id === node.leftId)) {
          d3Links.push({
            source: node.id,
            target: node.leftId,
            distance: 85,
            strength: 0.8
          });
        }
        if (node.rightId && nodes.some((n) => n.id === node.rightId)) {
          d3Links.push({
            source: node.id,
            target: node.rightId,
            distance: 85,
            strength: 0.8
          });
        }
      }
      for (const [bodyId] of d3NodesMap.entries()) {
        if (!activeIds.has(bodyId)) {
          d3NodesMap.delete(bodyId);
          nodePositions.delete(bodyId);
        }
      }
      const currentD3Nodes = Array.from(d3NodesMap.values());
      const validLinks2 = d3Links.filter(
        (l) => d3NodesMap.has(typeof l.source === "string" ? l.source : l.source.id) && d3NodesMap.has(typeof l.target === "string" ? l.target : l.target.id)
      );
      initOrUpdateSimulation(currentD3Nodes, validLinks2, resetPositions);
      return;
    }
    const reachableNodes = [];
    if (headId) {
      let currId = headId;
      const visited = /* @__PURE__ */ new Set();
      while (currId && !visited.has(currId)) {
        visited.add(currId);
        const node = nodes.find((n) => n.id === currId);
        if (node) {
          reachableNodes.push(node);
          currId = node.nextId;
        } else {
          break;
        }
      }
    }
    for (let i = 0; i < reachableNodes.length; i++) {
      const node = reachableNodes[i];
      activeIds.add(node.id);
      const nodeEl = document.createElement("div");
      nodeEl.id = `node-${node.id}`;
      nodeEl.className = "graph-node";
      if (node.isNewlyConnected) {
        nodeEl.classList.add("new-connected");
      } else if (node.isNewlyCreated) {
        nodeEl.classList.add("new-created");
      }
      const nextValDisplay = getNextAddressDisplay(node);
      nodeEl.innerHTML = `
      <div class="graph-node-body">
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell">
          <span class="cell-label">NEXT</span>
          <span class="cell-next-val ${node.nextId ? "has-target" : "is-null"}">${nextValDisplay}</span>
        </div>
      </div>
    `;
      nodesLayer.appendChild(nodeEl);
      const targetCenterX = 180 + i * 165;
      const targetCenterY = 135;
      registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 126, 50, "node", resetPositions);
      makeDraggable(nodeEl, node.id);
      const targetNodeExists = Boolean(node.nextId && nodes.some((n) => n.id === node.nextId));
      if (targetNodeExists) {
        d3Links.push({
          source: node.id,
          target: node.nextId,
          distance: 160,
          strength: 0.65
        });
        nodePositions.delete(`badge-null-${node.id}`);
        d3NodesMap.delete(`badge-null-${node.id}`);
      } else {
        const nullId = `badge-null-${node.id}`;
        activeIds.add(nullId);
        const nullBadge = document.createElement("div");
        nullBadge.id = nullId;
        nullBadge.className = "graph-badge-node null-badge-node";
        nullBadge.innerHTML = `<span class="null-glyph">\u2205</span><span class="null-text">nullptr</span>`;
        nodesLayer.appendChild(nullBadge);
        registerD3Node(nullId, nullBadge, targetCenterX + 120, targetCenterY, 78, 26, "null", resetPositions);
        makeDraggable(nullBadge, nullId);
        d3Links.push({
          source: node.id,
          target: nullId,
          distance: 110,
          strength: 0.75
        });
      }
    }
    const detachedNodes = nodes.filter((n) => n.isDetached);
    for (let j = 0; j < detachedNodes.length; j++) {
      const node = detachedNodes[j];
      activeIds.add(node.id);
      const nodeEl = document.createElement("div");
      nodeEl.id = `node-${node.id}`;
      nodeEl.className = "graph-node new-created";
      const nextValDisplay = getNextAddressDisplay(node);
      nodeEl.innerHTML = `
      <div class="graph-node-body">
        <div class="graph-node-data-cell">
          <span class="cell-label">DATA</span>
          <span class="cell-val">${node.data}</span>
        </div>
        <div class="graph-node-next-cell">
          <span class="cell-label">NEXT</span>
          <span class="cell-next-val ${node.nextId ? "has-target" : "is-null"}">${nextValDisplay}</span>
        </div>
      </div>
    `;
      nodesLayer.appendChild(nodeEl);
      const baseIdx = reachableNodes.length === 0 ? j : reachableNodes.length + j;
      const targetCenterX = 180 + baseIdx * 165;
      const targetCenterY = 135;
      registerD3Node(node.id, nodeEl, targetCenterX, targetCenterY, 126, 50, "node", resetPositions);
      makeDraggable(nodeEl, node.id);
      const targetExists = Boolean(node.nextId && nodes.some((n) => n.id === node.nextId));
      if (targetExists) {
        d3Links.push({
          source: node.id,
          target: node.nextId,
          distance: 160,
          strength: 0.65
        });
        nodePositions.delete(`badge-null-${node.id}`);
        d3NodesMap.delete(`badge-null-${node.id}`);
      } else {
        const nullId = `badge-null-${node.id}`;
        activeIds.add(nullId);
        const nullBadge = document.createElement("div");
        nullBadge.id = nullId;
        nullBadge.className = "graph-badge-node null-badge-node";
        nullBadge.innerHTML = `<span class="null-glyph">\u2205</span><span class="null-text">nullptr</span>`;
        nodesLayer.appendChild(nullBadge);
        registerD3Node(nullId, nullBadge, targetCenterX + 120, targetCenterY, 78, 26, "null", resetPositions);
        makeDraggable(nullBadge, nullId);
        d3Links.push({
          source: node.id,
          target: nullId,
          distance: 110,
          strength: 0.75
        });
      }
    }
    for (const [bodyId] of d3NodesMap.entries()) {
      if (!activeIds.has(bodyId)) {
        d3NodesMap.delete(bodyId);
        nodePositions.delete(bodyId);
      }
    }
    const validLinks = d3Links.filter((l) => {
      const srcId = typeof l.source === "string" ? l.source : l.source.id;
      const tgtId = typeof l.target === "string" ? l.target : l.target.id;
      return d3NodesMap.has(srcId) && d3NodesMap.has(tgtId);
    });
    initOrUpdateSimulation(Array.from(d3NodesMap.values()), validLinks, resetPositions);
  }
  btnInitialVisualize.onclick = () => vscode.postMessage({ command: "visualize" });
  btnPrev.onclick = () => vscode.postMessage({ command: "prev" });
  btnNext.onclick = () => vscode.postMessage({ command: "next" });
  btnRestart.onclick = () => vscode.postMessage({ command: "restart" });
  btnRetry.onclick = () => vscode.postMessage({ command: "retry" });
  btnResetLayout.onclick = () => {
    if (currentSnapshot) {
      nodePositions.clear();
      d3NodesMap.clear();
      resetCameraView(true);
      renderDiagram(currentSnapshot, true);
    }
  };
  graphViewport.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });
  graphViewport.addEventListener("pointerdown", (e) => {
    if (e.button === 2 || e.button === 1 || e.button === 0 && isSpacePressed) {
      e.preventDefault();
      e.stopPropagation();
      isPanning = true;
      startPanClientX = e.clientX;
      startPanClientY = e.clientY;
      initialPanX = cameraPanX;
      initialPanY = cameraPanY;
      graphViewport.classList.add("is-panning");
      document.body.classList.add("is-canvas-panning");
      try {
        graphViewport.setPointerCapture(e.pointerId);
      } catch {
      }
    }
  });
  graphViewport.addEventListener("pointermove", (e) => {
    if (isPanning) {
      const dx = e.clientX - startPanClientX;
      const dy = e.clientY - startPanClientY;
      cameraPanX = initialPanX + dx;
      cameraPanY = initialPanY + dy;
      applyCameraTransform(false);
    }
  });
  var stopPanning = (e) => {
    if (isPanning) {
      isPanning = false;
      graphViewport.classList.remove("is-panning");
      document.body.classList.remove("is-canvas-panning");
      try {
        graphViewport.releasePointerCapture(e.pointerId);
      } catch {
      }
    }
  };
  graphViewport.addEventListener("pointerup", stopPanning);
  graphViewport.addEventListener("pointercancel", stopPanning);
  graphViewport.addEventListener("wheel", (e) => {
    e.preventDefault();
    const rect = graphViewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const zoomFactor = e.deltaY < 0 ? 1.09 : 0.91;
    const newZoom = Math.min(2.5, Math.max(0.35, cameraZoom * zoomFactor));
    cameraPanX = mouseX - (mouseX - cameraPanX) * (newZoom / cameraZoom);
    cameraPanY = mouseY - (mouseY - cameraPanY) * (newZoom / cameraZoom);
    cameraZoom = newZoom;
    applyCameraTransform(false);
  }, { passive: false });
  graphViewport.addEventListener("dblclick", (e) => {
    if (e.target.closest(".graph-node, .graph-badge-node, .canvas-controls-overlay")) {
      return;
    }
    resetCameraView(true);
  });
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && !isSpacePressed && document.activeElement?.tagName !== "INPUT") {
      isSpacePressed = true;
      graphViewport.classList.add("can-pan");
    }
  });
  window.addEventListener("keyup", (e) => {
    if (e.code === "Space") {
      isSpacePressed = false;
      graphViewport.classList.remove("can-pan");
    }
  });
  window.addEventListener("message", (event) => {
    const msg = event.data;
    switch (msg.command) {
      case "status": {
        showView("loading");
        loadingText.textContent = msg.text;
        if (msg.step === "compiling") {
          loadingSubtext.textContent = "Compiling C++ source with -g -O0";
        } else if (msg.step === "launching") {
          loadingSubtext.textContent = "Launching GDB / LLDB debugger";
        } else if (msg.step === "waiting") {
          loadingSubtext.textContent = "Waiting for debugger stop at entry point";
        }
        updateBadge("running");
        break;
      }
      case "updateState": {
        showView("active");
        const { snapshot, canStepNext, canStepPrev, canRestart, isPaused, isRunning } = msg;
        if (isPaused) {
          updateBadge("paused");
        } else if (isRunning) {
          updateBadge("running");
        }
        stepChip.textContent = `Step ${snapshot.stepNumber}`;
        explanationText.textContent = snapshot.explanation;
        btnNext.disabled = !canStepNext;
        btnPrev.disabled = !canStepPrev;
        btnRestart.disabled = !canRestart;
        updateTerminal(snapshot.terminalOutput);
        renderDiagram(snapshot, false);
        break;
      }
      case "terminalOutput": {
        updateTerminal(msg.fullOutput);
        break;
      }
      case "error": {
        showView("error");
        updateBadge("error");
        errorMessage.textContent = msg.message;
        errorDetails.textContent = msg.details || "";
        btnRetry.style.display = msg.canRetry ? "inline-flex" : "none";
        break;
      }
      case "sessionEnded": {
        updateBadge("terminated");
        btnNext.disabled = true;
        btnRestart.disabled = false;
        explanationText.textContent = msg.reason || "Debugging session finished.";
        break;
      }
    }
  });
  showView("initial");
  updateBadge("idle");
  vscode.postMessage({ command: "requestState" });
})();
//# sourceMappingURL=webview.js.map
