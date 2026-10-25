#include <iostream>

struct Vertex {
  int value;
  Vertex* nextVertex;
};

struct Edge {
  Vertex* source;
  Vertex* target;
  double weight;
  bool directed;
  Edge* nextEdge;
};

struct Graph {
  Vertex* vertexHead;
  Edge* edgeHead;
};

int main() {
  Graph graph{nullptr, nullptr};

  Vertex* v1 = new Vertex{1, nullptr};
  Vertex* v2 = new Vertex{2, nullptr};
  Vertex* v3 = new Vertex{3, nullptr};

  graph.vertexHead = v1;
  v1->nextVertex = v2;
  v2->nextVertex = v3;

  Edge* e1 = new Edge{v1, v2, 5.0, true, nullptr};
  graph.edgeHead = e1;
  Edge* e2 = new Edge{v2, v3, 10.0, true, nullptr};
  e1->nextEdge = e2;

  volatile int checkpoint = 0;
  checkpoint = 1;  // Set a breakpoint here to inspect the complete graph.
  std::cout << "Graph ready: 3 vertices, 2 edges." << std::endl;

  checkpoint = 2;  // Step here to verify later snapshots and source highlighting.
  std::cout << "Checkpoint " << checkpoint << std::endl;
  return 0;
}
