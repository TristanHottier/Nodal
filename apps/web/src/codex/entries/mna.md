# Modified nodal analysis

## What it is

Modified nodal analysis (MNA) is the way Nodal turns a schematic into equations a computer can solve. Every analysis, from the operating point to a transient run, builds a matrix equation $A\,x = b$ with MNA and solves it.

The idea is Kirchhoff's current law at every node, plus one extra equation for each element that cannot be written as "current as a function of node voltages". Voltage sources and inductors are the usual examples.

## Equations

### Unknowns

The unknown vector stacks two kinds of quantity:

$$
x = \begin{bmatrix} v \\ i \end{bmatrix}
$$

The vector $v$ holds the voltage of every node except ground. Ground is node `0`, it is the reference, and it is not an unknown. Some parts add internal nodes of their own (a diode with a series resistance `RS` has a node inside the device), and these appear in $v$ as well. The vector $i$ holds one branch current for each independent voltage source, each VCVS, each CCVS and each inductor.

### Rows

There is one KCL row per node. It says that the currents leaving the node through the connected elements add up to zero. Currents that are known in advance, such as an independent current source, move to the right-hand side $b$.

There is one branch row per branch-current element. It holds the element's own equation, for example $v_{n^+} - v_{n^-} = V$ for a voltage source.

Currents follow the SPICE convention: a branch current is positive when it flows from the positive node through the element to the negative node. A battery that delivers power therefore has a negative branch current.

### Why voltage sources add rows

A voltage source fixes the voltage across it and lets the current be whatever the rest of the circuit demands. There is no formula for that current in terms of node voltages, so it cannot be put in a KCL row as a conductance. MNA makes the current an unknown, adds it to the two KCL rows with signs $+1$ and $-1$, and adds one equation that states the voltage. An inductor works the same way: its branch current is an unknown, and keeping it in $x$ makes the inductor current directly probeable.

### A worked example

A 10 V source drives a divider. $R_1 = 1\ \text{k}\Omega$ joins node 1 to node 2, and $R_2 = 2\ \text{k}\Omega$ joins node 2 to ground. The source $V_1$ sits between node 1 and ground. With $g_1 = 1/R_1$ and $g_2 = 1/R_2$, the unknowns are $v_1$, $v_2$ and the source current $i_V$:

$$
\begin{bmatrix}
g_1 & -g_1 & 1 \\
-g_1 & g_1 + g_2 & 0 \\
1 & 0 & 0
\end{bmatrix}
\begin{bmatrix} v_1 \\ v_2 \\ i_V \end{bmatrix}
=
\begin{bmatrix} 0 \\ 0 \\ 10 \end{bmatrix}
$$

The first two rows are KCL at nodes 1 and 2. The third is the branch row $v_1 = 10\ \text{V}$. Solving gives $v_1 = 10\ \text{V}$, $v_2 = 6.667\ \text{V}$ and $i_V = -3.333\ \text{mA}$. The sign is negative because the source delivers current.

### Stamps

Each element adds its terms into $A$ and $b$ independently of the others. A resistor adds $+g$ on the two diagonal entries of its nodes and $-g$ on the two off-diagonal entries. Entries that name ground are dropped. The complete list of stamps is in the part entries (resistor, sources, controlled sources, capacitor, inductor, semiconductors) and in the repository's `docs/reference/mna.md`.

### Linearised and reactive elements

A nonlinear element is replaced at each [Newton iteration](#/codex/convergence) by its tangent: a conductance in parallel with a constant current source. A capacitor is an open circuit in DC, an admittance $j\omega C$ in AC, and a companion model in transient analysis (see [integration](#/codex/integration)). An inductor is a short circuit in DC through its branch row, and has the row $v_{n^+} - v_{n^-} - j\omega L\, i_k = 0$ in AC.

### When the matrix is singular

If two rows are not independent, $A$ has no inverse and the solve fails. Nodal checks the two common causes before solving. A node with no DC path to ground leaves its KCL row without a reference, and a loop of voltage sources, VCVS or CCVS outputs, or inductors makes the branch rows dependent. Capacitors and current sources do not count as DC paths. Each error names the elements and nodes involved.

## Where Nodal uses it

Every analysis assembles its system this way: the [operating point](#/codex/operating-point), the [DC sweep](#/codex/dc-sweep), [AC analysis](#/codex/ac-analysis) and [transient analysis](#/codex/transient). The parts that add branch rows are the [voltage source](#/codex/vsource), the [inductor](#/codex/inductor), the [VCVS](#/codex/vcvs) and the [CCVS](#/codex/ccvs). A [resistor](#/codex/resistor) is the simplest stamp.
