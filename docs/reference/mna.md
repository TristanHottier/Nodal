# Modified Nodal Analysis — stamps

Reference for `nodal-engine`'s `mna/` and `devices/` modules. All sign conventions here are binding: the code and its tests follow them.

## 1. Unknowns and equations

The unknown vector is

$$
x = \begin{bmatrix} v \\ i \end{bmatrix}
$$

- $v$: voltages of all non-ground nodes. Ground is node `0` and is not an unknown.
- $i$: **branch currents** of every element that needs one: independent voltage sources, VCVS, CCVS, and inductors.

The system is $A\,x = b$:
- one **KCL row** per node: the sum of currents **leaving** the node through elements equals zero; known current terms move to $b$;
- one **branch row** per branch-current element: its constitutive equation.

**Current convention (SPICE):** a branch current $i_k$ of element $k$ with nodes $(n^+, n^-)$ is positive when it flows from $n^+$ **through the element** to $n^-$. So $i_k$ leaves node $n^+$ (entry $+1$ in row $n^+$) and enters node $n^-$ (entry $-1$ in row $n^-$).

In the stamps below, any entry that names ground is skipped. Stamps add (`+=`) into $A$ and $b$.

## 2. Linear elements

### Resistor $R$ between $n^+, n^-$ — conductance $g = 1/R$

| | $n^+$ | $n^-$ |
|---|---|---|
| $n^+$ | $+g$ | $-g$ |
| $n^-$ | $-g$ | $+g$ |

$R = 0$ is rejected at validation. Model a short with a 0 V source.

### Independent current source $I$, from $n^+$ through the source to $n^-$

The current leaves $n^+$, so it moves to the right-hand side with the opposite sign:

$$ b_{n^+} \mathrel{-}= I, \qquad b_{n^-} \mathrel{+}= I $$

### Independent voltage source $V$, branch $k$, $v_{n^+} - v_{n^-} = V$

| | $n^+$ | $n^-$ | $i_k$ | $b$ |
|---|---|---|---|---|
| row $n^+$ | | | $+1$ | |
| row $n^-$ | | | $-1$ | |
| row $k$ | $+1$ | $-1$ | | $V$ |

With this convention, a battery delivering power has a **negative** $i_k$. ngspice reports the same sign.

### VCCS (G) — $i = g_m\,(v_{c^+} - v_{c^-})$ from $n^+$ through the source to $n^-$

| | $c^+$ | $c^-$ |
|---|---|---|
| row $n^+$ | $+g_m$ | $-g_m$ |
| row $n^-$ | $-g_m$ | $+g_m$ |

### VCVS (E) — branch $k$, $v_{n^+} - v_{n^-} = \mu\,(v_{c^+} - v_{c^-})$

KCL rows as for a voltage source ($+1$ in row $n^+$, $-1$ in row $n^-$, column $k$). Branch row $k$:

| $n^+$ | $n^-$ | $c^+$ | $c^-$ | $b$ |
|---|---|---|---|---|
| $+1$ | $-1$ | $-\mu$ | $+\mu$ | $0$ |

### CCCS (F) — $i = \beta\, i_c$, where $i_c$ is the branch current of the controlling voltage source

| | column $c$ |
|---|---|
| row $n^+$ | $+\beta$ |
| row $n^-$ | $-\beta$ |

### CCVS (H) — branch $k$, $v_{n^+} - v_{n^-} = r\, i_c$

KCL rows as for a voltage source. Branch row $k$:

| $n^+$ | $n^-$ | column $c$ | $b$ |
|---|---|---|---|
| $+1$ | $-1$ | $-r$ | $0$ |

### Ideal op-amp (v1 macro)

A VCVS with output $(n_{out}, 0)$, controlled by $(n_{+in}, n_{-in})$, gain $\mu = 10^6$ by default. The inputs draw no current. There are no output rails in v1.

## 3. Reactive elements

### Capacitor $C$ — $i = \dfrac{dq}{dt}$, $q = C\,(v_{n^+} - v_{n^-})$

| Analysis | Stamp |
|---|---|
| DC | Open circuit: nothing stamped. Every node needs a DC path to ground, or validation fails with "floating node". |
| AC | Admittance $j\omega C$ in the resistor pattern. |
| Transient | Companion model from the integration formula ([numerical-methods.md](numerical-methods.md) §2): conductance $G_{eq}$ in the resistor pattern, and current $I_{eq}$ added to $b$ as $b_{n^+} \mathrel{-}= I_{eq}$, $b_{n^-} \mathrel{+}= I_{eq}$. |

Trapezoidal, step $h$, with $v$ and $i$ taken at the previous accepted point $n$:

$$
i_{n+1} = \dfrac{2C}{h}\,v_{n+1} \;-\; \left(\dfrac{2C}{h}\,v_n + i_n\right)
\quad\Rightarrow\quad
G_{eq} = \dfrac{2C}{h},\qquad I_{eq} = -\left(\dfrac{2C}{h}\,v_n + i_n\right)
$$

Backward Euler: $G_{eq} = \dfrac{C}{h}$, $I_{eq} = -\dfrac{C}{h}\,v_n$.

### Inductor $L$ — branch $k$, $v_{n^+} - v_{n^-} = L\,\dfrac{di_k}{dt}$

KCL rows as for a voltage source. The branch row depends on the analysis:

| Analysis | Branch row $k$ |
|---|---|
| DC | $v_{n^+} - v_{n^-} = 0$ (short circuit). |
| AC | $v_{n^+} - v_{n^-} - j\omega L\, i_k = 0$ |
| Transient, trapezoidal | $v_{n^+} - v_{n^-} - \dfrac{2L}{h}\, i_{k,n+1} = -\dfrac{2L}{h}\, i_{k,n} - v_n$ |
| Transient, backward Euler | $v_{n^+} - v_{n^-} - \dfrac{L}{h}\, i_{k,n+1} = -\dfrac{L}{h}\, i_{k,n}$ |

Here $v_n$ is the inductor voltage at the previous accepted point. Keeping $i_k$ as an unknown, rather than using a Norton companion, makes inductor currents directly probeable and lets CCCS/CCVS reference them later.

## 4. Nonlinear elements: linearized companion models

At Newton iterate $x^{(k)}$, a nonlinear branch current $I(V)$ is replaced by its tangent:

$$
I(V) \approx I(V^{(k)}) + g\,(V - V^{(k)}),\qquad g = \left.\dfrac{\partial I}{\partial V}\right|_{V^{(k)}}
$$

That is, a conductance $g$ in parallel with a constant current $I_{eq} = I(V^{(k)}) - g\,V^{(k)}$. $I_{eq}$ is stamped like an independent current source flowing $n^+ \to n^-$.

Multi-terminal devices (BJT, MOSFET) stamp one transconductance per controlling voltage. Equations and conductances are in [devices.md](devices.md).

## 5. Gmin

A conductance `gmin` (default $10^{-12}$ S) is placed in parallel with every pn junction, as in SPICE. ngspice also puts `gmin` on the MOSFET bulk junctions. Nodal v1 has no bulk junctions, so it puts `gmin` across each MOSFET drain–source channel instead. This is a listed deviation ([devices.md](devices.md) §5). gmin stepping (numerical-methods §1.4) temporarily raises it to help DC convergence.

## 6. Topology checks before solving

| Condition | Why it fails | Detection |
|---|---|---|
| Node with no DC path to ground | Singular $A$ in DC | Union–find over DC edges (below); every node must reach ground |
| Loop of V sources / VCVS / CCVS outputs / inductors | Branch rows linearly dependent | Cycle detection in the graph of those elements |

**DC edges:** R, L, independent V sources, VCVS and CCVS output pairs, diode anode–cathode, BJT B–E and B–C, MOSFET drain–source, switch output pair.
**Not DC edges:** C, independent I sources, VCCS and CCCS outputs, every controlling port (including the switch control pair), MOSFET gate and bulk.

A node reached only through capacitors and current sources fails the first check, so it needs no separate rule.

Each error names the elements and nodes involved.
