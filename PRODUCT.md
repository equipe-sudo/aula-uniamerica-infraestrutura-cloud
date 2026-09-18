# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

A **Equipe SUDO** (5 estudantes) e o **professor** da disciplina de Cloud Computing. Os dois usam o app pelo navegador, normalmente durante a demonstração da entrega — o professor abre o domínio, autentica no Cloudflare Access e testa a lista; os integrantes usam para validar a aplicação e gerar dados para os painéis de observabilidade.

## Product Purpose

É a lista de tarefas ("Lista de Tarefas") fornecida pelo professor e usada como **camada de aplicação** do projeto de infraestrutura em nuvem. Existe para exercitar, de ponta a ponta, o caminho front-end → API → banco, e para gerar dados reais observáveis. Sucesso = criar, concluir e excluir tarefas funcionando pelo domínio, com a operação visível nas métricas e logs.

## Positioning

O valor do projeto está na **infraestrutura**, não na aplicação: o app é deliberadamente simples. O que o diferencia é ser operável, observável e publicado em um domínio próprio com HTTPS, proxy reverso e controle de acesso — algo que uma lista de tarefas de tutorial não tem.

## Operating Context

Uso pelo navegador no domínio `equipe-sudo.kolpzs.com` (atrás do Cloudflare Access). A API é consumida no mesmo domínio por `/api`. É comum ser visto em tela compartilhada durante a apresentação, e frequentemente em celular. Nenhum usuário tem conta própria dentro do app.

## Capabilities and Constraints

- **Funcionalidades:** listar tarefas, criar, alternar concluída, excluir. Nada além.
- **Técnico:** React 19 com Create React App, uma única tela, sem roteamento e sem gerenciador de estado externo.
- **Contrato da API (não pode mudar):** `GET /api/todos`, `POST /api/todos {text}`, `PATCH /api/todos/:id`, `DELETE /api/todos/:id`.
- **Escopo desta rodada:** apenas o visual. Nenhuma funcionalidade nova.
- **Requisito explícito do usuário:** modo escuro.

## Brand Commitments

Nome de exibição "Lista de Tarefas" em português. A equipe se chama **SUDO** e o projeto já foi apresentado como **CyberVegas**; não há logotipo, paleta ou tipografia oficiais definidos. Textos da interface devem continuar em português.

## Evidence on Hand

Dados reais de tarefas no MongoDB, visíveis na própria lista. Não existem depoimentos, clientes, preços ou métricas de negócio — nada disso deve ser inventado.

## Product Principles

1. **A tarefa primeiro:** a lista é o conteúdo; a interface desaparece atrás dela.
2. **Legível de longe:** precisa funcionar em tela compartilhada e no celular durante a apresentação.
3. **Simples de conferir:** estados de vazio, carregando e erro claros o bastante para um avaliador entender em segundos.
4. **Sem invenção:** nada de recursos, textos ou números que o app não tenha de verdade.

## Accessibility & Inclusion

Contraste de texto adequado (WCAG AA) nos dois temas, navegação por teclado com foco visível, alvos de toque confortáveis no celular e respeito a `prefers-reduced-motion`.
