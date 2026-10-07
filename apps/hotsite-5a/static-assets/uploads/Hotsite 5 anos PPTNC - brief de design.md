# Hotsite 5 anos PPTNC — brief de design

Oct 7, 2026 · @Wellington

Este brief orienta o Claude Design no layout do hotsite de RSVP. Estados, textos e regras do evento estão na especificação: Doc. Em caso de conflito, a especificação vale.

## Objetivo e tom

O design tem um trabalho principal: levar o convidado a tocar em Confirmar presença em poucos segundos, sentindo que recebeu um convite pessoal e exclusivo.

**Tom**

- Convite pessoal, não página de marketing. O convidado é tratado pelo nome e reconhecido pelo episódio que gravou.
- Celebração com sobriedade: editorial, tecnológico, escuro e quente. A festa aparece nos balões e no laranja, não em excesso de efeitos.
- Público sênior (CIOs, CTOs, arquitetos): nada infantil, nada de "growth hacking" visível. Persuasão pela hierarquia visual, não por pressão.

**Critérios de sucesso do layout**

1. Na primeira tela do celular, sem rolar, o convidado vê seu nome, a data, o local e o botão de confirmar.
2. O botão de confirmar é o elemento de maior contraste da página inteira.
3. Quem rola encontra motivos para dizer sim: o próprio episódio, a trajetória do podcast, a noite e quem estará lá.
4. A página parece da mesma família do flyer do Save the Date e do mídia kit do evento.
5. O ingresso depois da confirmação é bonito o bastante para ser printado e compartilhado.

## Telas a desenhar

São 13 telas, priorizadas: o celular vem antes, e a página completa do convite aberto é a peça que define o sistema visual.

| # | Tela | Formato | Prioridade |
| --- | --- | --- | --- |
| 1 | Convite aberto, página completa (todas as seções) | Celular 390px | Alta |
| 2 | Convite aberto, primeira tela (recorte de 390×844) | Celular | Alta |
| 3 | Confirmado, sem acompanhante liberado (topo com ingresso) | Celular | Alta |
| 4 | Confirmado, acompanhante liberado e ainda sem nome | Celular | Alta |
| 5 | Confirmado, com acompanhante informado | Celular | Média |
| 6 | Tela intermediária antes de recusar (bottom sheet sobre a página) | Celular | Alta |
| 7 | Recusou (topo) | Celular | Média |
| 8 | Acesso restrito, campo vazio | Celular | Alta |
| 9 | Acesso restrito, código inválido (erro) | Celular | Média |
| 10 | Barra fixa visível no meio da rolagem | Celular | Média |
| 11 | Quadros-chave da animação de confirmação (início, meio, ingresso revelado) | Celular | Média |
| 12 | Convite aberto, página completa | Computador 1440px | Média |
| 13 | Imagem de prévia do WhatsApp | 1200×630 | Alta |

Além das telas, uma folha de componentes com os estados de cada um (normal, pressionado, foco, desabilitado, carregando).

## Layout

Uma coluna no celular, com margens laterais de 20px; no computador, conteúdo centralizado com largura máxima de 1120px e o topo dividido em duas colunas.

**Celular (390px)**

- Coluna única, margens de 20px, grade interna de 4 colunas com 12px de espaçamento.
- Seções separadas por 72–96px, cada uma aberta por rótulo mono com traço laranja (`— A NOITE`).
- Cards de números em 2 colunas; o card de Pessoas impactadas ocupa a largura total.

**Hierarquia da primeira tela (de cima para baixo)**

1. Selo do podcast pequeno e rótulo `CONVITE PESSOAL · 5 ANOS`.
2. Nome do convidado em título grande (pode quebrar em duas linhas).
3. Frase de apoio em uma ou duas linhas.
4. **29/10** grande em laranja: o maior elemento tipográfico da tela, como no flyer.
5. Linha mono com dia, horário e endereço.
6. Botão Confirmar presença na largura total, com o prazo logo abaixo e o link Não poderei ir.

O "5" gigante e um balão ficam no fundo, à direita, em baixa opacidade, sem passar por trás do botão.

**Computador (1440px)**

- Topo em duas colunas: texto e botão à esquerda, painel com o "5" e o balão à direita (como o quadro do flyer).
- Seções abaixo em grade de 12 colunas; números em uma linha de 5 cards, como no slide 5 do mídia kit.
- O botão principal não ultrapassa 360px de largura.
- Barra fixa vira faixa no topo da janela ao rolar.

## Tokens

Os valores abaixo são ponto de partida extraído do flyer e do mídia kit; o Claude Design pode ajustá-los para fidelidade às peças, mantendo a lógica.

**Cores**

| Token | Valor de partida | Uso |
| --- | --- | --- |
| bg | #0B0B0F | Fundo da página |
| surface | #16161B | Cards, bottom sheet, barra fixa |
| border | #2A2A30 | Bordas e divisórias |
| accent | #F26B21 | Botão principal, destaques, data, números |
| accent-glow | #F26B21 a 12–20% | Brilho radial e fundo do card de destaque |
| text | #F2F1EC | Títulos e texto principal |
| text-muted | #9A9AA0 | Apoio, rótulos, links secundários |
| on-accent | #0B0B0F | Texto sobre o laranja |
| error | tom de vermelho que funcione no escuro | Erro do código |
| brand | #1E1236 | Selo do podcast |

**Escala tipográfica de partida (celular)**

| Estilo | Família | Tamanho / linha | Uso |
| --- | --- | --- | --- |
| Data | Grotesca | 88 / 88, peso médio | 29/10 no topo |
| Display | Grotesca | 36 / 40 | Nome do convidado |
| H2 | Grotesca | 28 / 32 | Títulos de seção |
| Número | Grotesca | 40 / 44 | Cards de números |
| Corpo | Grotesca | 17 / 26 | Textos |
| Rótulo | Mono, caixa alta, espaçamento 0,2em | 12 / 16 | Rótulos e metadados |
| Código | Mono, espaçamento 0,15em | 28 / 32 | Ingresso |

No computador, a data sobe para \~160px e o display para \~64px.

**Forma**

- Raios: cards 16px, botões e pílulas totalmente arredondados, campos 12px.
- Bordas de 1px; card de destaque com borda laranja a \~40% e brilho interno.
- Sem sombras projetadas: a profundidade vem do brilho laranja e da diferença entre bg e surface.

## Componentes

Quinze componentes formam a página; o botão principal e o ingresso são os dois que merecem mais cuidado.

| Componente | Descrição | Estados |
| --- | --- | --- |
| Botão principal | Pílula laranja, texto escuro, seta →, altura 56px, largura total no celular | Normal, pressionado, foco, carregando |
| Botão secundário | Pílula com contorno laranja e texto claro (Adicionar à agenda, Adicionar) | Normal, pressionado, foco |
| Link terciário | Texto cinza pequeno, sublinhado no toque (Não poderei ir, Vou sozinho, alterar) | Normal, foco |
| Rótulo de seção | Traço laranja curto + texto mono em caixa alta | — |
| Card | Surface, borda de 1px, raio 16px | — |
| Card de destaque | Card com borda laranja e brilho quente interno | — |
| Card de número | Número grande + rótulo mono abaixo; variante laranja para Pessoas impactadas | — |
| Pílula de cargo | Contorno, texto claro, tamanho de rótulo | — |
| Ingresso | Cartão com recorte de canhoto (picote e meias-luas laterais), código mono grande, data e selo; rótulo Mostre este código na entrada | Revelação animada |
| Campo de texto | Fundo surface, borda, raio 12px; usado no código e no nome do acompanhante | Vazio, foco, preenchido, erro |
| Item de linha do tempo | Ponto + horário mono + atividade; variante EM BREVE em cinza | Definido, em breve |
| Bloco de logo | Cartão branco com logo centralizado, todos do mesmo tamanho | — |
| Miniatura de vídeo | Capa do episódio 16:9 com botão de play laranja; carrega o vídeo só no toque | Capa, reproduzindo |
| Barra fixa | Faixa inferior, surface translúcida com desfoque, botão principal | Visível, oculta |
| Bottom sheet | Painel que sobe sobre a página com fundo escurecido; usado antes de recusar | Aberto |

O ingresso é o momento de recompensa: deve ter cara de ingresso de verdade, com o código como protagonista, e caber inteiro na tela para um print.

## Movimento

O movimento se concentra num único momento, a confirmação; no resto da página ele é discreto e curto.

**Confirmação (o momento principal)**

1. Toque no botão: estado pressionado e carregando por até \~300ms.
2. Balões laranja sobem do pé da tela em velocidades diferentes, \~1,2s no total, sem cobrir o texto por muito tempo.
3. O topo troca para Presença confirmada! e o ingresso surge com leve escala (0,96 → 1) e fade.
4. Se o acompanhante estiver liberado, a pergunta aparece logo abaixo do ingresso, depois que a animação termina.

**Demais transições**

- Bottom sheet de recusa: sobe em \~250ms, fundo escurece; fecha ao tocar fora.
- Barra fixa: desliza de baixo ao sair do topo; some com fade depois da resposta.
- Seções: aparição suave ao entrar na tela (fade + 8px), uma vez só.
- Erro do código: leve tremor horizontal no campo e mensagem abaixo.

**Redução de movimento**

Com a preferência de reduzir movimento ativa no aparelho, sem balões e sem deslocamentos: as trocas de estado viram fade simples.

## Acessibilidade

O tema escuro com laranja funciona bem, desde que três pontos de contraste sejam verificados.

- **Botão principal:** texto escuro sobre laranja, não branco, para garantir contraste suficiente.
- **Laranja como texto:** reservado para tamanhos grandes (data, números, palavra destacada no título); em texto pequeno, usar branco-gelo ou cinza.
- **Cinza de apoio:** conferir contraste mínimo de 4,5:1 sobre o fundo; os rótulos mono de 12px são o caso mais frágil.
- **Foco:** contorno visível em laranja em todos os elementos tocáveis, para navegação por teclado no computador.
- **Toque:** área mínima de 44×44px, inclusive nos links terciários (Não poderei ir, alterar).
- **Texto ampliado:** o topo continua legível com fonte do sistema aumentada, mesmo que deixe de caber na primeira tela.
- **Imagens e logos:** com texto alternativo; balões e o "5" de fundo são decorativos.

## Conteúdo de exemplo e casos-limite

Os mockups usam um convidado fictício e os números do mídia kit como exemplo; nenhum dado real de convidado entra nas telas.

**Convidado fictício**

- Nome: Mariana Albuquerque
- Código: MARIANA742
- Último episódio: título fictício, 12,4 mil visualizações
- Quadro: E mais 2 episódios com 18,9 mil visualizações, desde 14/03/2022
- Acompanhante (telas 4 e 5): Rafael Albuquerque

**Números de exemplo (do mídia kit, só para o mockup)**

240+ Episódios · 45 mil Seguidores e inscritos · 2,65 mi Visualizações · 172 mil+ Horas assistidas · 4,3 mi+ Pessoas impactadas

**Programação de exemplo**

Todos os itens como EM BREVE (estado real no lançamento), com uma variante mostrando 3 itens preenchidos para validar o componente.

**Casos-limite a testar no layout**

- Nome longo: "Maria Fernanda Cavalcanti de Albuquerque" (deve quebrar sem empurrar o botão para fora da primeira tela de forma grave).
- Nome curto: "Ana Lu".
- Convidado com um único episódio (sem quadro).
- Convidado com muitos episódios ("E mais 7 episódios…").
- Número de visualizações baixo (ex.: 860): o layout não deve dar destaque excessivo ao número.
- Código longo no ingresso (14 caracteres).
- Nome do acompanhante longo.
- Tela pequena (360px) e tela grande (430px).

## Assets, referências e o que evitar

O flyer do Save the Date é a referência principal do topo; o mídia kit do evento é a referência das seções abaixo.

**Referências por seção**

| Seção do hotsite | Referência |
| --- | --- |
| Topo e prévia do WhatsApp | Flyer do Save the Date (5 gigante, balão, 29/10 em laranja, rótulos mono) |
| Seu episódio | Card de destaque do slide 2 do mídia kit |
| 5 anos em números | Slide 5 (cards de números) |
| A noite | Slide 2 (cards numerados 01–04) |
| Programação | Slide 6 (linha do tempo) |
| Networking | Slide 3 (pílulas de cargos) |
| Apoiadores | Slide 8 (cartões brancos com logos) |

**Assets necessários**

- Selo do PPT Não Compila em vetor
- Flyer do Save the Date e mídia kit do evento (anexados na conversa de planejamento)
- Logos: NullPlatform, VMBears, Klever, Elven, Maralto, Trends News
- Foto do Wellington (a definir; usar placeholder com tratamento em tons quentes)
- Balão e "5" do flyer, redesenhados em vetor se necessário

**Evitar**

- Aparência de landing page de vendas: sem depoimentos, sem contadores, sem urgência artificial.
- Lista ou rosto de outros convidados em qualquer tela.
- A frase "Exclusivo para amigos e convidados que já gravaram".
- Mascote IAra, emojis e ilustrações infantis.
- Versão em tema claro.
- Revelar o presente surpresa (nem imagem, nem pista).

## Pendências de design

Três itens chegam depois e entram no layout já previsto, sem mudar a estrutura.

- [ ] Foto final do Wellington e o tratamento de cor
- [ ] Texto final da nota e frase de posicionamento na assinatura
- [ ] Programação definida (substitui os itens EM BREVE)
