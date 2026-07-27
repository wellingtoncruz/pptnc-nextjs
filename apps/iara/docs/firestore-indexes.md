# Índices compostos do Firestore

`apps/iara/firestore.indexes.json` é a fonte de verdade versionada dos índices
compostos do IAra, no formato do Firebase CLI.

## Por que este arquivo existe

Até 2026-07-27 os 6 índices existiam **apenas no GCP**. Não havia cópia no repo,
então qualquer operação que apagasse um banco os levava junto sem possibilidade
de reconstrução — só sobrava recriá-los à mão, a partir de queries quebradas em
produção.

O gatilho foi um refresh de base para homologação: reconstruir
`pptnc-stage-refresh` a partir de `pptnc-prod` exige apagar o banco de destino
(o import do Firestore é *upsert*, não substituição, e sem o delete sobrariam
documentos de execuções anteriores). Apagar o banco apaga os índices.

## O que quebra sem eles

Queries que dependem de índice composto falham com `FAILED_PRECONDITION` — não
degradam, param. Entre elas a **busca semântica**, que usa o índice `VECTOR` de
768 dimensões em `videos.summaryVector`.

Índices são construídos em background: depois de aplicados, ficam em `CREATING`
por alguns minutos antes de `READY`. Durante essa janela as queries ainda falham.
Homologar nesse intervalo faz o app parecer quebrado sem estar.

## Como aplicar

Via Firebase CLI (requer `firebase.json` apontando para este arquivo):

```bash
firebase deploy --only firestore:indexes --project pptnc-stage
```

Ou diretamente com `gcloud`, um comando por índice — ver o passo 7 de
`scripts/refresh-stage-database.sh`, que gera os comandos a partir deste mesmo
formato. Atenção ao índice VECTOR: o `--field-config` carrega JSON com aspas
duplas e precisa vir aspado, senão o shell as remove e o índice não é criado.

## Como re-extrair depois de mudanças

Ao adicionar um índice pelo Console ou pelo link de erro do Firestore, ele passa
a existir só no GCP de novo. Sincronize:

```bash
gcloud firestore indexes composite list \
  --database=pptnc-prod --project=pptnc-stage --format=json
```

Ao converter para este formato, note que `__name__` com `ASCENDING` é implícito e
deve ser omitido, mas com `DESCENDING` precisa ser explícito — dois dos índices
de `videos` dependem disso para ficarem idênticos ao original.

## Verificação

```bash
gcloud firestore indexes composite list \
  --database=<banco> --project=pptnc-stage \
  --format="table(name.basename(),state)"
```

Os 6 precisam estar `READY`.
