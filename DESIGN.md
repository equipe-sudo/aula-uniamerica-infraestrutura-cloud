# Design

<!-- impeccable:design-schema 1 -->

Sistema visual da **Lista de Tarefas** (Equipe SUDO). Descreve o que foi construído, não o que se pretendeu.
Direção: terminal/TUI — seed `73f5240a`, modo `operate`. Contrato em `frontend/public/index.html` (primeiro filho do `<body>`).

## World

A lista é a **saída de uma sessão de shell**. Um único frame-janela é a grade inteira: barra de título, corpo com as linhas de tarefa, pé com a contagem e o prompt. Não há cards flutuantes, nem "hero", nem cartões aninhados.

O mundo recusa o padrão da categoria (um card centralizado com input e checklist). Ele deve sua identidade ao público: estudantes de infraestrutura e o professor, que leem terminais todos os dias.

## Palette

Cor carrega **estado**, nunca decoração. Dois perfis, ambos no mesmo sistema.

| Papel | Escuro | Claro |
|---|---|---|
| `--ground` (mesa) | `#0b0e0d` | `#e7e4dd` |
| `--surface` (janela) | `#101514` | `#f7f5f0` |
| `--surface-2` (barra/pé) | `#161d1b` | `#efebe3` |
| `--frame` / `--frame-strong` (bordas) | `#2a3431` / `#3d4a45` | `#c7c1b4` / `#a49c8c` |
| `--fg` | `#d9e2dc` | `#21272a` |
| `--fg-muted` | `#93a39b` | `#55605d` |
| `--fg-faint` | `#7f8d86` | `#626b66` |
| `--open` (aberta) | `#e0a53f` | `#8f5c0f` |
| `--done` (concluída) | `#57d38a` | `#176b43` |
| `--error` | `#f2705f` | `#ab372b` |
| `--focus` / seleção | `#7fe3ab` / `#2f6b52` | `#1c6b4a` / `#bfe3cf` |

Contraste: corpo, placeholder, rodapé e texto "fraco" ≥ 4.5:1 nos dois temas (WCAG AA). Os tons claros de âmbar/verde/vermelho são as versões escurecidas dos mesmos papéis, para manter a leitura em papel.

## Type

**Fragment Mono** (SIL OFL 1.1), auto-hospedada em `src/fonts/fragment-mono-latin.woff2`. Mono é o material do mundo — e aqui o texto é dado (rotas, contagens, estado), não fantasia.

Escala: base 15px (16px no celular), barra de título 13px, rodapé 12px, ação `excluir` 12px. Não há tipografia de display: num terminal, o conteúdo é a voz.

## Grid & spacing

- Uma unidade `--step: 8px` comanda paddings e o respiro do frame.
- O frame **preenche a altura**: `height: min(760px, calc(100vh - 4 × step))` no desktop; `100dvh` no celular, sem borda nem raio.
- Regras de 1px separam as linhas; não há sombra em elementos internos. A janela tem sombra suave com deslocamento e blur (`0 18px 40px -24px`) — profundidade, não adorno.
- Raio: 6px na janela, 3px nos controles.

## Components

| Peça | Regra |
|---|---|
| `.win__chrome` | Host `sudo@equipe-sudo:~/tarefas` + alternador de tema. `sudo` em `--fg`, o resto em `--fg-muted`. |
| `.theme` | Botão que **nomeia a ação** ("claro"/"escuro" = para onde vai). SVG autoral (sol/lua), sem emoji. |
| `.task` | Linha: um único controle (`.task__toggle`) com o glifo de estado + o texto, e a ação `.task__kill`. |
| `.task__state` | `[ ]` / `[x]` — o estado aparece por **glifo e cor** (WCAG 1.4.1). |
| `.task__kill` | "excluir"; invisível até hover/foco no desktop, sempre visível no toque. |
| `.win__foot` | Contagem (`aria-live`) + dica `enter adiciona`; abaixo, o prompt. |
| `.prompt` | `$` (verde) + input sem borda; desabilitado durante o envio. |

## States

`carregando` (reticências animadas), `vazio` (convite para digitar), `erro` (mensagem + "tentar de novo"), `enviando` (prompt desabilitado), `concluída` (texto riscado e esmaecido), `foco` visível em todos os controles.

## Motion

Um só momento autoral: ao alternar uma tarefa, o glifo faz um **flip** curto (320ms, `cubic-bezier(0.16,0.84,0.3,1)`) e a linha pisca o fundo. Nada de entradas repetidas por seção. `prefers-reduced-motion` reduz tudo a ~0ms.

## Browser surfaces

Seleção, `caret-color`, scrollbar (fina, na cor do frame), `:focus-visible` e `color-scheme` são tematizados a partir da paleta. É o sinal mais barato de uma página construída em vez de montada.

## Assets & provenance

| Asset | Origem |
|---|---|
| `src/fonts/fragment-mono-latin.woff2` | Fragment Mono — Google Fonts (SIL OFL 1.1), baixada e auto-hospedada |
| `public/favicon.svg` | SVG autoral (janela + prompt `>` e cursor) |
| `public/logo192.png`, `logo512.png` | Herdados do Create React App — **não fazem parte do mundo**; substituir ou remover |
| `public/robots.txt` | Herdado do CRA |

## Accessibility & Inclusion

Contraste AA nos dois temas; alvos de toque ≥44px no celular; `aria-live` na contagem; `aria-label` nomeando a ação em cada controle de linha; glifo além da cor para o estado; foco visível; movimento redutível. Idioma `pt-BR`.

## Known gaps

- O cursor em bloco do terminal **não** foi implementado: apenas o caret nativo, tematizado. Fica como próximo passo natural do mundo.
- `logo192.png` / `logo512.png` ainda são os do CRA (aparecem em instalação PWA).
