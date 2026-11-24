// Offline candidate search for boards of up to 11 x 11. Each seed starts a new
// answer; no board or answer from a previous seed is used to make another one.
#include <algorithm>
#include <array>
#include <cstdint>
#include <cstdlib>
#include <iostream>
#include <numeric>
#include <string>

using Cells = unsigned __int128;
using Units = uint64_t;
constexpr int MAX_SIZE = 11, MAX_CELLS = 121, MAX_UNITS = 33;
using Grid = std::array<int, MAX_CELLS>;

int count(Cells bits) {
  return __builtin_popcountll(uint64_t(bits)) +
         __builtin_popcountll(uint64_t(bits >> 64));
}
int first(Cells bits) {
  const auto low = uint64_t(bits);
  return low ? __builtin_ctzll(low)
             : 64 + __builtin_ctzll(uint64_t(bits >> 64));
}
Cells bit(int index) { return Cells(1) << index; }

struct Random {
  uint32_t state;
  int below(int limit) {
    state ^= state << 13;
    state ^= state >> 17;
    state ^= state << 5;
    return state % limit;
  }
};

struct Board {
  int n, area;
  Cells all;
  Units allUnits;
  Grid colors{}, anchors{};
  std::array<int, MAX_SIZE> answer{};
  std::array<Cells, MAX_UNITS> units{};
  std::array<Cells, MAX_CELLS> neighbors{}, fixedConflicts{};
  std::array<Units, MAX_CELLS> axes{};

  Board(int size, Random &random)
      : n(size), area(n * n), all(bit(area) - 1),
        allUnits((Units(1) << (3 * n)) - 1) {
    std::iota(answer.begin(), answer.begin() + n, 0);
    do {
      for (int r = n - 1; r > 0; --r)
        std::swap(answer[r], answer[random.below(r + 1)]);
    } while (!validAnswer());
    int background = random.below(n);
    colors.fill(background);
    anchors.fill(-1);
    for (int r = 0; r < n; ++r) {
      const int cat = r * n + answer[r];
      colors[cat] = r;
      anchors[cat] = r;
    }
    for (int i = 0; i < area; ++i) {
      int r = i / n, c = i % n;
      units[r] |= bit(i);
      units[n + c] |= bit(i);
      units[2 * n + colors[i]] |= bit(i);
      axes[i] = (Units(1) << r) | (Units(1) << (n + c));
      if (r > 0)
        neighbors[i] |= bit(i - n);
      if (c > 0)
        neighbors[i] |= bit(i - 1);
      if (c + 1 < n)
        neighbors[i] |= bit(i + 1);
      if (r + 1 < n)
        neighbors[i] |= bit(i + n);
    }
    for (int i = 0; i < area; ++i) {
      int r = i / n, c = i % n;
      Cells mask = units[r] | units[n + c];
      for (int row = std::max(r - 1, 0); row <= std::min(r + 1, n - 1); ++row)
        for (int col = std::max(c - 1, 0); col <= std::min(c + 1, n - 1); ++col)
          mask |= bit(row * n + col);
      fixedConflicts[i] = mask;
    }
  }
  bool validAnswer() const {
    for (int r = 1; r < n; ++r)
      if (std::abs(answer[r] - answer[r - 1]) <= 1)
        return false;
    return true;
  }
  Cells region(int color) const { return units[2 * n + color]; }
  bool connected(Cells cells) const {
    Cells frontier = cells & -cells, visited = frontier;
    while (frontier) {
      Cells expansion = ((frontier & ~units[n]) >> 1) |
                        ((frontier & ~units[2 * n - 1]) << 1) |
                        (frontier >> n) | (frontier << n);
      frontier = expansion & cells & ~visited;
      visited |= frontier;
    }
    return visited == cells;
  }
  void paint(int cell, int to) {
    units[2 * n + colors[cell]] ^= bit(cell);
    units[2 * n + to] |= bit(cell);
    colors[cell] = to;
  }
  void place(int cell, Cells &open, Units &todo) const {
    open &= ~(fixedConflicts[cell] | region(colors[cell]));
    todo &= ~(axes[cell] | (Units(1) << (2 * n + colors[cell])));
  }
  // Anchors are a known legal solution. Search only until a different layout is
  // found.
  bool alternative(Cells open, Units todo, bool differs = false) const {
    if (!todo)
      return differs;
    int best = area + 1;
    Cells options = 0;
    for (Units scan = todo; scan; scan &= scan - 1) {
      Cells candidates = units[__builtin_ctzll(scan)] & open;
      int size = count(candidates);
      if (!size)
        return false;
      if (size < best) {
        best = size;
        options = candidates;
        if (best == 1)
          break;
      }
    }
    while (options) {
      int cell = first(options);
      options &= options - 1;
      Cells available = open;
      Units left = todo;
      place(cell, available, left);
      if (alternative(available, left, differs || anchors[cell] < 0))
        return true;
    }
    return false;
  }
  bool moveBoundary(Random &random, bool balance, int compactness) {
    int cell = random.below(area);
    if (anchors[cell] >= 0)
      return false;
    int direction = random.below(4);
    int next = cell + (direction == 0   ? -1
                       : direction == 1 ? 1
                       : direction == 2 ? -n
                                        : n);
    if (next < 0 || next >= area || !(neighbors[cell] & bit(next)))
      return false;
    int from = colors[cell], to = colors[next];
    if (from == to)
      return false;
    if (balance && count(region(from)) <= count(region(to)) && random.below(10))
      return false;
    if (compactness &&
        count(neighbors[cell] & region(from)) >
            count(neighbors[cell] & region(to)) &&
        random.below(5) < compactness)
      return false;
    if (!connected(region(from) ^ bit(cell)))
      return false;
    paint(cell, to);
    if (!alternative(all, allUnits))
      return true;
    paint(cell, from);
    return false;
  }
  void restore(const Grid &previous) {
    for (int i = 0; i < area; ++i)
      if (previous[i] != colors[i])
        paint(i, previous[i]);
  }
};

// A fast prescreen following the in-game hint order. The published boards are
// separately replayed in the TypeScript hint engine and checked by enumeration.
struct Trace {
  int hardest = 0, advanced = 0, depth = -1, score = 0, opening = -1;
  int beforeFirstCat = 0, consecutiveChains = 0, longestChainRun = 0;
  bool placedCat = false, solved = false;
  void step(int strategy, int chainDepth = -1) {
    static constexpr int weights[] = {1, 4, 10, 20, 28, 48};
    if (opening < 0)
      opening = strategy;
    if (strategy == 0)
      placedCat = true;
    else if (!placedCat)
      ++beforeFirstCat;
    consecutiveChains = strategy >= 4 ? consecutiveChains + 1 : 0;
    longestChainRun = std::max(longestChainRun, consecutiveChains);
    hardest = std::max(hardest, strategy);
    advanced += (strategy >= 3);
    depth = std::max(depth, chainDepth);
    score += weights[strategy];
  }
};

struct Grader {
  const Board &b;
  Cells open;
  Units todo;
  Trace trace;
  explicit Grader(const Board &board)
      : b(board), open(b.all), todo(b.allUnits) {}
  Cells candidates(int unit) const { return open & b.units[unit]; }
  bool eliminate(Cells evidence, int strategy) {
    if (!(evidence & open))
      return false;
    open &= ~evidence;
    trace.step(strategy);
    return true;
  }
  bool basic() {
    for (int r = 0; r < b.n; ++r) {
      int color = b.colors[r * b.n];
      if ((b.units[r] & b.region(color)) != b.units[r])
        continue;
      for (int c = 0; c < b.n; ++c) {
        int cell = r * b.n + c;
        if (!(open & bit(cell)) ||
            (b.units[b.n + c] & b.region(color)) != b.units[b.n + c])
          continue;
        b.place(cell, open, todo);
        trace.step(0);
        return true;
      }
    }
    for (Units scan = todo; scan; scan &= scan - 1) {
      Cells opts = candidates(__builtin_ctzll(scan));
      if (opts && !(opts & (opts - 1))) {
        b.place(first(opts), open, todo);
        trace.step(0);
        return true;
      }
    }
    return false;
  }
  bool locking() {
    for (int axis : {0, b.n}) {
      for (int k = 0; k < b.n; ++k) {
        Cells g = candidates(2 * b.n + k);
        if (!g)
          continue;
        int root = first(g), line = axis + (axis ? root % b.n : root / b.n);
        if (!(g & ~b.units[line]) && eliminate(b.units[line] & ~b.region(k), 1))
          return true;
      }
    }
    for (int i = 0; i < 2 * b.n; ++i) {
      Cells line = candidates(i);
      if (!line)
        continue;
      Cells g = b.region(b.colors[first(line)]);
      if (!(line & ~g) && eliminate(g & ~b.units[i], 1))
        return true;
    }
    return false;
  }
  bool sets(int start, int remaining, int length, Cells group, unsigned rows,
            unsigned cols, const std::array<unsigned, MAX_SIZE> &rowMasks,
            const std::array<unsigned, MAX_SIZE> &colMasks) {
    if (__builtin_popcount(rows) > length && __builtin_popcount(cols) > length)
      return false;
    if (remaining == 0) {
      for (int axis : {0, b.n}) {
        unsigned lines = axis ? cols : rows;
        if (__builtin_popcount(lines) != length)
          continue;
        Cells strip = 0;
        for (; lines; lines &= lines - 1)
          strip |= b.units[axis + __builtin_ctz(lines)];
        if (eliminate(strip & ~group, length <= 3 ? 2 : 3))
          return true;
      }
      return false;
    }
    for (int i = start; i <= b.n - remaining; ++i) {
      if (!rowMasks[i])
        continue;
      if (sets(i + 1, remaining - 1, length, group | b.region(i),
               rows | rowMasks[i], cols | colMasks[i], rowMasks, colMasks))
        return true;
    }
    return false;
  }
  bool lockingSets() {
    std::array<unsigned, MAX_SIZE> rows{}, cols{};
    for (int color = 0; color < b.n; ++color) {
      for (Cells scan = candidates(2 * b.n + color); scan; scan &= scan - 1) {
        int i = first(scan);
        rows[color] |= 1u << (i / b.n);
        cols[color] |= 1u << (i % b.n);
      }
    }
    int active = __builtin_popcountll(todo) / 3;
    for (int k = 2; k <= std::min(6, active - 1); ++k)
      if (sets(0, k, k, 0, 0, 0, rows, cols))
        return true;
    return false;
  }
  bool contradiction() {
    int best = b.n + 1, excluded = -1;
    for (Cells scan = open; scan && best; scan &= scan - 1) {
      int cell = first(scan);
      Cells opts = open;
      Units left = todo;
      b.place(cell, opts, left);
      for (int depth = 0; depth < best; ++depth) {
        int single = -1;
        for (Units units = left; units; units &= units - 1) {
          Cells available = b.units[__builtin_ctzll(units)] & opts;
          if (!available) {
            best = depth;
            excluded = cell;
            single = -1;
            break;
          }
          if (!(available & (available - 1)) && single < 0)
            single = first(available);
        }
        if (single < 0)
          break;
        b.place(single, opts, left);
      }
    }
    if (excluded < 0)
      return false;
    open &= ~bit(excluded);
    trace.step(best <= 2 ? 4 : 5, best);
    return true;
  }
  Trace solve() {
    while (todo && (basic() || locking() || lockingSets() || contradiction())) {
    }
    trace.solved = !todo;
    return trace;
  }
};

// Scan the same regions from all eight directions. Grader reads only the
// regions, never an answer. A failed solve in any orientation rejects the board.
int gradeHardReadings() {
  constexpr int n = 11;
  Random random{42};
  Board board(n, random);
  std::string regions;
  while (std::cin >> regions) {
    if (regions.size() != n * n)
      return 2;
    int minAdvanced = n * n, minDepth = n;
    for (int transform = 0; transform < 8; ++transform) {
      Grid grid{};
      for (int i = 0; i < board.area; ++i) {
        int row = i / n, col = i % n;
        if (transform & 4) std::swap(row, col);
        if (transform & 2) row = n - 1 - row;
        if (transform & 1) col = n - 1 - col;
        char label = regions[i];
        if ((label < '0' || label > '9') && label != 'a') return 2;
        grid[row * n + col] = label == 'a' ? 10 : label - '0';
      }
      board.restore(grid);
      Trace result = Grader(board).solve();
      if (!result.solved) {
        minAdvanced = minDepth = -1;
        break;
      }
      minAdvanced = std::min(minAdvanced, result.advanced);
      minDepth = std::min(minDepth, result.depth);
    }
    std::cout << minAdvanced << ' ' << minDepth << '\n';
  }
  return 0;
}

int main(int argc, char **argv) {
  if (argc == 2 && std::string(argv[1]) == "--hard-readings")
    return gradeHardReadings();
  if (argc != 5)
    return 2;
  int n = std::stoi(argv[1]), start = std::stoi(argv[2]),
      end = std::stoi(argv[3]), effort = std::stoi(argv[4]);
  if (n < 4 || n > MAX_SIZE || start < 0 || end < start || end >= 1000000 ||
      effort < 0)
    return 2;
  for (int trial = start; trial < end; ++trial) {
    uint32_t seed = (n * 1000000 + trial + 1u) * 2654435761u;
    Random random{seed};
    Board b(n, random);
    const int background = b.colors[b.anchors[0] < 0 ? 0 : 1];
    if (!b.connected(b.region(background)))
      continue;
    int compactness = random.below(4);
    // Vary the size of the largest region and the first deduction across seeds.
    int areaLimit = n == 11 ? n * (19 + random.below(13)) / 10
                            : n * (23 + random.below(23)) / 10;
    int openingRoll = random.below(100);
    int preferredOpening = openingRoll < 25   ? 0
                           : openingRoll < 62 ? 1
                           : openingRoll < 84 ? 2
                           : openingRoll < 97 ? 3
                                              : 4;
    auto acceptable = [&]() {
      int singles = 0, largest = 0;
      for (int k = 0; k < n; ++k) {
        int size = count(b.region(k));
        singles += size == 1;
        largest = std::max(size, largest);
      }
      return singles <= 1 && largest <= areaLimit;
    };
    for (int pass = 0; pass < 12; ++pass) {
      int moves = b.area * (pass == 0 ? 30 : 12);
      for (int i = 0; i < moves; ++i)
        b.moveBoundary(random, true, pass % 3 ? 0 : compactness);
      if (acceptable())
        break;
    }
    int best = -1;
    Trace trace;
    Grid selected{};
    // Anneal on this answer only. Independent seeds may pursue very different
    // region shapes, opening clues and chain depths.
    for (int stage = 0; stage <= effort; ++stage) {
      if (stage) {
        if (best >= 0 && random.below(5) != 0)
          b.restore(selected);
        int target = 2 + random.below(n + 2), changes = 0;
        for (int i = 0; i < target * 25 && changes < target; ++i)
          changes += b.moveBoundary(random, false, compactness);
      }
      if (!acceptable())
        continue;
      Trace result = Grader(b).solve();
      if (!result.solved)
        continue;
      int fitness = 16 + result.advanced * 3 + std::min(result.depth, 6) * 10 +
                    (result.hardest == 5 ? 30 : 0);
      if (n == 11) {
        if (result.opening == preferredOpening)
          fitness += 65;
        else if (preferredOpening >= 2 && result.opening >= 2)
          fitness += 35;
      }
      if (fitness > best || (fitness == best && random.below(4) == 0)) {
        best = fitness;
        selected = b.colors;
        trace = result;
      }
    }
    if (best < 0)
      continue;
    const char *digits = "0123456789a";
    std::cout << trial << ' ' << trace.hardest << ' ' << trace.advanced << ' '
              << trace.depth << ' ' << trace.score << ' ' << trace.opening << ' '
              << trace.beforeFirstCat << ' ' << trace.longestChainRun
              << ' ';
    for (int r = 0; r < n; ++r)
      std::cout << digits[b.answer[r]];
    std::cout << ' ';
    for (int i = 0; i < b.area; ++i)
      std::cout << digits[selected[i]];
    std::cout << '\n';
  }
  return 0;
}
