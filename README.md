# all-tec

Aplicação em Node.js para apagar mensagens da própria conta no Discord em dois modos:

- `CL`: limpa suas mensagens em um canal específico.
- `CL ALL`: limpa suas mensagens em massa com base em um `package.zip` exportado pelo Discord.

## O que o projeto faz

O app faz login com uma conta, lista um menu no terminal e permite:

- entrar com token novo ou conta salva;
- salvar contas em `data/accounts.json`;
- apagar suas mensagens de um único canal;
- apagar suas mensagens de vários canais, DMs, grupos e servidores a partir de um arquivo `package.zip`.

## Requisitos

Antes de começar, tenha instalado:

- `git`
- `Node.js`
- `npm`

Para conferir:

```bash
git --version
node --version
npm --version
```

## Baixando do zero

Clone o projeto:

```bash
git clone <URL_DO_REPOSITORIO>
cd all-tec
```

Se você já baixou em `.zip`, apenas extraia e entre na pasta:

```bash
cd all-tec
```

## Instalando as dependências

Na raiz do projeto, rode:

```bash
npm install
```

Isso baixa as dependências definidas no [package.json](/home/sh/Dev/all-tec/package.json).

## Estrutura básica do projeto

Os arquivos principais são:

- [index.js](/home/sh/Dev/all-tec/index.js): ponto de entrada.
- [src/app.js](/home/sh/Dev/all-tec/src/app.js): fluxo principal do app, login, menu, `CL` e `CL ALL`.
- [data/accounts.json](/home/sh/Dev/all-tec/data/accounts.json): criado automaticamente para salvar contas.
- `package.zip`: arquivo que você precisa colocar na raiz para usar o `CL ALL`.

## Como executar

Na raiz do projeto:

```bash
node index.js
```

Ao abrir, o app mostra:

1. tela de login;
2. opção de usar conta salva ou entrar com token novo;
3. menu principal com `CL` e `CL ALL`.

## Login e contas salvas

### Primeiro acesso

Se for a primeira vez, escolha `Novo user`.

O app vai pedir:

```text
🔐 Insira sua token:
```

Depois do login com sucesso, a conta é salva automaticamente em `data/accounts.json`.

### Próximos acessos

Se já existir conta salva, o menu mostrará:

- `Logar com conta salva`
- `Novo user`

Ao escolher conta salva, o app reutiliza o token já guardado.

## Como usar o CL

`CL` significa limpeza em canal único.

Esse modo:

- pede o ID de um canal;
- busca todas as mensagens desse canal;
- filtra apenas as mensagens do usuário logado;
- apaga uma por uma.

### Passo a passo

1. Execute:

```bash
node index.js
```

2. Faça login.
3. No menu principal, selecione `CL - Limpeza em Canal Único`.
4. Selecione `Iniciar limpeza por canal`.
5. Informe o ID do canal quando aparecer:

```text
🎯 Digite o ID do canal para apagar suas mensagens:
```

6. Aguarde o app rastrear e apagar suas mensagens.

### Resultado esperado

Ao final, o app mostra:

- quantidade de mensagens apagadas;
- nome ou ID do canal;
- tempo total da limpeza.

### Observações do CL

- o canal precisa ser um canal de texto acessível pela conta;
- o app só apaga mensagens da conta logada;
- se o ID estiver errado ou o canal não for de texto, o app informa erro.

## Como usar o CL ALL

`CL ALL` significa limpeza em massa.

Esse modo não varre o Discord inteiro sozinho. Ele usa um `package.zip` na raiz do projeto para descobrir quais canais devem ser processados.

### O que é o `package.zip`

É um arquivo `.zip` que deve conter a pasta:

```text
package/Mensagens
```

Dentro dela, o app espera várias subpastas de canais, e em cada uma precisa existir um arquivo:

```text
channel.json
```

O `channel.json` é usado para ler:

- `id` do canal
- `type` do canal

### Onde colocar o arquivo

Coloque o arquivo exatamente na raiz do projeto com o nome:

```text
package.zip
```

Exemplo:

```text
all-tec/
  index.js
  package.json
  package.zip
  src/
```

Se esse arquivo não existir, o `CL ALL` não roda.

### Tipos de canal aceitos no CL ALL

Ao iniciar o `CL ALL`, o app deixa você marcar quais grupos deseja limpar:

- `DMs Diretos (conversas 1x1)`
- `Grupos Privados (conversas com 3+ pessoas)`
- `Servidores (todos os canais de servidores)`

Você marca com `Espaço` e confirma com `Enter`.

### WhiteList no CL ALL

Depois da seleção dos tipos, o app pede:

```text
🛡️ WhiteList (IDs separados por vírgula, espaço ou vazio para incluir todos):
```

Aqui você pode informar IDs de canais que não devem ser limpos.

Exemplos:

```text
123456789012345678
```

```text
123456789012345678, 987654321098765432
```

```text
123456789012345678 987654321098765432
```

Se deixar vazio, o app tenta processar todos os canais compatíveis encontrados no `package.zip`.

### Passo a passo do CL ALL

1. Coloque o `package.zip` na raiz do projeto.
2. Execute:

```bash
node index.js
```

3. Faça login.
4. No menu principal, selecione `CL ALL - Limpeza em Massa`.
5. Marque os tipos de canal que deseja limpar.
6. Pressione `Enter`.
7. Informe a `WhiteList` ou deixe vazia.
8. Aguarde a extração do `.zip` e o processamento dos canais.

### O que o app faz internamente no CL ALL

Durante o processo, o app:

1. extrai o `package.zip` para uma pasta temporária;
2. lê `package/Mensagens`;
3. percorre as pastas de canais;
4. lê cada `channel.json`;
5. filtra os canais pelos tipos escolhidos;
6. ignora os IDs que estiverem na whitelist;
7. abre cada canal no Discord;
8. busca e apaga apenas as mensagens da conta logada;
9. remove as pastas temporárias processadas;
10. apaga a pasta temporária ao final.

### Resultado esperado

Ao final do `CL ALL`, o app mostra:

- total de mensagens apagadas;
- tempo total;
- quantidade de canais processados.

### Quando o CL ALL não vai funcionar

O processo pode parar ou ignorar canais quando:

- `package.zip` não estiver na raiz;
- a pasta `package/Mensagens` não existir dentro do zip;
- algum `channel.json` estiver ausente ou inválido;
- o canal não existir mais;
- a conta não tiver acesso ao canal;
- nenhum canal do zip bater com os tipos marcados.

## Como conseguir os IDs de canal

Você vai precisar do ID do canal para usar o `CL`.

No Discord, normalmente isso é feito ativando o modo desenvolvedor nas configurações do app e depois copiando o ID do canal com clique direito.

## Arquivos gerados pelo projeto

Durante o uso, o projeto pode criar:

- `data/accounts.json`: armazenamento das contas salvas;
- pastas temporárias como `temp_messages_<timestamp>` durante o `CL ALL`.

As pastas temporárias são removidas ao final do processo.

## Problemas comuns

### Token inválido ou acesso negado

Se aparecer erro de token:

- confirme se o token foi colado completo;
- tente entrar novamente com `Novo user`.

### Canal inválido

Se o app disser que o canal não é válido:

- revise o ID;
- confirme se é canal de texto;
- confirme se a conta logada tem acesso.

### `package.zip` não encontrado

Verifique se:

- o arquivo está na raiz do projeto;
- o nome é exatamente `package.zip`.

### Nenhum canal corresponde aos tipos selecionados

Isso acontece quando:

- você marcou tipos que não existem no zip;
- todos os canais encontrados caem fora pela whitelist;
- os `channel.json` não têm tipos compatíveis.

## Fluxo rápido

### Rodar o CL

```bash
npm install
node index.js
```

Depois:

1. login
2. `CL`
3. informar ID do canal
4. aguardar a limpeza

### Rodar o CL ALL

```bash
npm install
node index.js
```

Depois:

1. colocar `package.zip` na raiz
2. login
3. `CL ALL`
4. marcar tipos de canal
5. informar whitelist ou deixar vazio
6. aguardar a limpeza em massa

## Observação importante

O projeto usa login por token com `discord.js-selfbot-v13`. Antes de usar em uma conta real, revise os riscos e as regras da plataforma do Discord.
