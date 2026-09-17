# Argo CD Trace

[English README](../README.md)

O Argo CD Trace é uma extensão de interface que adiciona a aba **Trace** aos
recursos `Application`. Ela reúne origem, revisão, última operação, mudanças de
manifesto, divergências atuais, histórico de deployments e hierarquia sem
precisar de um backend separado.

## O que a extensão mostra

| Pergunta                    | Informação apresentada                                                     |
| --------------------------- | -------------------------------------------------------------------------- |
| O que está configurado?     | Repositório Git/Helm, path/chart e target revision                         |
| O que está ativo?           | Revisão informada pelo sync status, com fallback de histórico identificado |
| O que acabou de acontecer?  | Fase, usuário, prune e contexto de selective sync da última operação       |
| O que mudou no deployment?  | Diferenças de recursos e campos entre manifestos renderizados              |
| O que está diferente agora? | Diferenças entre o estado desejado e o estado live                         |
| De onde veio a Application? | Hierarquia de ApplicationSet e App-of-Apps                                 |

## Princípios de precisão

O Trace não mistura conceitos que parecem semelhantes:

- revisão desejada, revisão ativa e revisão registrada no histórico;
- autor do commit Git e usuário que iniciou o Sync;
- retorno a uma revisão antiga e uso comprovado da API de Rollback;
- mudança entre manifestos renderizados e drift atual no cluster;
- dado indisponível e resultado realmente vazio.

Em Applications multi-source, a comparação só ocorre quando existe uma revisão
para cada source. Se as configurações históricas registradas forem diferentes
da configuração atual, a comparação é bloqueada. Valores de `data` e
`stringData` de Secrets são ocultados antes da exibição e do cache.

Leia [Modelo de precisão](accuracy.md) para conhecer as regras e limitações.

## Compatibilidade

- Validado com Argo CD `3.2.12`.
- Node.js `22.12+` para desenvolvimento; Node `24` recomendado.
- React e ReactDOM são fornecidos pelo próprio Argo CD e não entram no bundle.
- Applications single-source e multi-source com Git ou Helm.

Outras versões do Argo CD ainda devem ser tratadas como não validadas. O Argo
CD 3.5 alterou a UI de React 16 para React 19; embora o projeto externalize
React e use o runtime JSX clássico, falta um teste de integração nessa versão.

## Desenvolvimento local

```bash
git clone https://github.com/caiomartin/argocd-trace.git
cd argocd-trace
nvm use
npm ci
npm run check
```

O comando executa os testes e o build TypeScript/Vite. O arquivo distribuído é:

```text
dist/extension-trace.js
```

## Instalação rápida

```bash
docker build -f Dockerfile.build -t argocd-trace:v1.8.0 .

export ARGOCD_NAMESPACE=argocd
kubectl patch deployment argocd-server \
  -n "$ARGOCD_NAMESPACE" \
  --type strategic \
  --patch-file k8s/argocd-server-patch.yaml

kubectl rollout status deployment/argocd-server \
  -n "$ARGOCD_NAMESPACE"
```

O init container copia `extension-trace.js` para `/tmp/extensions`. Depois do
rollout, abra uma Application e selecione a aba **Trace**.

Consulte [Instalação e troubleshooting](installation.md) para registry remoto,
kind, validação e problemas comuns.

## Segurança e acesso

As chamadas usam a mesma origem e a sessão atual do usuário no Argo CD. A
extensão não recebe credenciais do Kubernetes nem do Git e não consulta GitHub
ou GitLab diretamente. Os dados que aparecem respeitam o acesso concedido pela
API do Argo CD ao usuário autenticado.

Falhas ao listar outras Applications afetam apenas a resolução completa da
hierarquia; as outras seções continuam funcionando quando seus endpoints estão
autorizados.

## Contribuições

Issues e pull requests são bem-vindos. Antes de enviar uma mudança:

```bash
npm ci
npm run check
```

Leia [CONTRIBUTING.md](../CONTRIBUTING.md) e inclua testes para qualquer mudança
nas regras de revisão, operação, diff ou hierarquia.

## Documentos

- [Instalação e troubleshooting](installation.md)
- [Modelo de precisão e limitações](accuracy.md)
- [Arquitetura e fontes de dados](architecture.md)
- [Política de segurança](../SECURITY.md)
- [Processo de release](../RELEASING.md)

O projeto utiliza a [Apache License 2.0](../LICENSE). Argo e Argo CD são marcas
da The Linux Foundation; este não é um projeto oficial do Argo.
