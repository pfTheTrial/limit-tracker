# Testando a extensão Limit Tracker no Linux (Arch + niri)

> **Documento de handoff.** Este arquivo acompanha o código da extensão. Quando
> você estiver no Linux (dualboot Arch + niri), abra este `.md` e peça a um agente
> (outro Hermes, ou qualquer assistente) para te ajudar usando **exatamente** as
> instruções abaixo. Tudo que o agente precisa saber está aqui — não depende de
> memória externa.

---

## 0. CONTEXTO (leia isto primeiro, agente)

**O que é isto:** uma extensão **nativa do launcher Vicinae** chamada
*Limit Tracker*, que monitora limites de uso de agentes de IA (Claude, Codex,
Copilot, Cursor, DeepSeek, Gemini, OpenCode Go, z.ai). É um fork reescrito do
zero a partir do "Agent Usage" do Raycast — a versão original era um fork rápido
que usava camada de compatibilidade com Raycast (`@raycast/api`), e foi
**reescrita 100% nativa** para o Vicinae (`@vicinae/api`).

**Decisões já tomadas (não reabra):** ver fichário "Limit Tracker Architecture"
no Maestri caso tenha acesso; senão, o resumo:
- **Nativo, não compat:** só `@vicinae/api`, zero `@raycast/api`/`@raycast/utils`.
- **Core 8 providers** nesta v1: claude, codex, copilot, cursor, deepseek,
  gemini, opencode-go, zai. (Os outros 10 — aihubmix, amp, antigravity,
  clinepass, droid, grok, kimi, minimax, minimaxcn, synthetic — ficam para fase 2;
  o código deles existe em `src/` mas NÃO está no registry/comandos.)
- **Extremamente leve:** `Cache` nativo do Vicinae, `usePromise` local
  (`src/agents/use-promise.ts`), sem polyfill.
- **Cross-platform:** fetchers usam `os.homedir()` / `env HOME`/`USERPROFILE` e
  brancham `darwin`/`win32`/`linux`.

**Por que testar no Linux:** no **Windows (alfa, build run 33008691144)** o
`vici develop` *registra* a dev session (confirmado no log do app:
`Start extension development session for "limit-tracker"`), mas a extensão
**não aparece na UI** (Alt+Space). O `extension manager` do app inicia com 0
extensões. Não é erro do código — o alfa do Windows ainda não lista extensões
dev na UI. No **Linux o loader de extensões deve funcionar**.

**O que JÁ foi validado (sem app, no Windows):**
- `tsc --noEmit` → OK (typecheck limpo)
- `npx vici build` → OK (empacotou em `AppData/Roaming/vicinae/extensions/limit-tracker`)
- 231 testes Node (`npm test`) → 231 passando, 0 falhas
- App Vicinae responde ao `vicinae://.../start` (EXIT 0)
- O binário do app está em `C:\Users\<user>\AppData\Local\Programs\Vicinae\bin\vicinae.exe`
  (no Windows NÃO estava no PATH; no Linux o `vicinae` costuma estar no PATH após instalar)

**O que FALTA validar (só dá com o app rodando):** a renderização React nativa
dos comandos `agent-usage` (view) e `agent-usage-menubar` (menu-bar), e a
detecção de credenciais dos 8 providers nos paths do Linux.

---

## 1. Pré-requisitos no Linux (agente: confira com o usuário)

1. **Vicinae instalado** no Linux (site oficial tem instruções/pacote p/ Linux).
2. **`vicinae` no PATH** — rode `which vicinae`. Se vazio, ache o binário
   (`find / -name vicinae -type f 2>/dev/null` ou olhe onde o instalador pôs) e
   adicione ao PATH ou crie symlink em `/usr/local/bin`.
3. **Vicinae rodando** (atalho / `vicinae` no terminal / Alt+Space se ativo).
4. **Node + npm** (Node 20+).
5. **Protocolo `vicinae://` registrado** (a instalação normalmente faz).

---

## 2. Levar o código para o Linux

A pasta da extensão é `extensions/limit-tracker/` (contém `package.json`,
`tsconfig.json`, `src/`, `assets/`, e este `.md`). Leve **sem** `node_modules`:

```bash
# No Windows (ou origem), empacote sem node_modules:
cd "E:\projetos\Limit Checker\extensions"
zip -r limit-tracker.zip limit-tracker -x "limit-tracker/node_modules/*" "limit-tracker/.git/*"
# Leve pro Arch (pen-drive, scp, syncthing, git) e extraia, ex.:
mkdir -p ~/projetos/limit-tracker && unzip limit-tracker.zip -d ~/projetos/
```

> Via git também funciona: clone o repo no Linux. O essencial é a pasta
> `limit-tracker/` íntegra (package.json + tsconfig.json + src/ + assets/).

---

## 3. Instalar dependências

```bash
cd ~/projetos/limit-tracker
npm install
```

Instala `@vicinae/api`, `@bufbuild/protobuf`, `undici`, `typescript`,
`@types/react`, etc. (todos no `package.json`).

> No Linux o `npx` é binário real, então o build roda sem os contornos que foram
> necessários no sandbox Windows (lá o `vici build` quebrava em `spawnSync('npx')`
> e precisei patchear `node_modules/@vicinae/api/dist/commands/build/index.js`).
> **Não patcheie nada aqui** a menos que o build realmente quebre.

---

## 4. Disparar o modo desenvolvedor

```bash
cd ~/projetos/limit-tracker
npx vici develop
```

Saída esperada (igual ao Windows quando o app responde):

```
info  - entrypoints [src/agent-usage.tsx, src/agent-usage-menubar.tsx]
ready - Extension built in XXXms 🚀
```

Fica em **watch mode** (recarrega sozinho ao editar). Parar: `Ctrl+C`.

> Se der `Failed to ping vicinae` / `spawnSync vicinae ENOENT`: `vicinae` não está
> no PATH. `export PATH="$PATH:/caminho/para/bin/do/vicinae"` e rode de novo.

---

## 5. Verificar no Vicinae

1. Abra o Vicinae (Alt+Space ou atalho).
2. Na command palette procure **"Limit Tracker"** (comando `agent-usage`, modo
   view) e **"Limit Tracker Menu Bar"** (modo menu-bar).
3. Se abrirem a lista de providers → **funcionou**.
4. Deve aparecer também em **Settings → Extensions** (se o Vicinae Linux tiver).

---

## 6. Credenciais por provider no Linux (agente: ajude a conferir)

| Provider     | Onde lê a credencial no Linux                              |
|--------------|-----------------------------------------------------------|
| Claude       | `~/.claude/.credentials.json` (auto)                     |
| Codex        | `~/.codex/auth.json` (auto)                               |
| Cursor       | SQLite do Cursor em `~/.cursor` (auto)                   |
| Copilot      | `GH_TOKEN` / `GITHUB_TOKEN` ou pref `copilotAuthToken`  |
| DeepSeek     | `DEEPSEEK_API_KEY` / `DEEPSEEK_KEY` ou login OpenCode    |
| Gemini       | binário `gemini` / `~/.config/gemini`                    |
| OpenCode Go  | `OPENCODE_API_KEY` ou pref `opencodegoApiKey`            |
| z.ai (GLM)   | `ZAI_API_KEY` / `GLM_API_KEY` ou pref `zaiApiToken`     |

Se um provider não achar credencial, ele mostra estado de erro/ausente na lista
(ícone + tooltip) — é comportamento esperado, **não** bug.

---

## 7. Troubleshooting (agente: siga esta ordem)

1. **`Failed to ping vicinae` / `spawnSync vicinae ENOENT`**
   → `vicinae` fora do PATH. Veja passo 1 e 4.
2. **Build falha** (`vici build`/`develop`)
   → `npm run typecheck` e `npm test` para isolar.
   → Só patcheie `node_modules/@vicinae/api/dist/commands/build/index.js` se o
     erro for `spawnSync('npx')` ENOENT (raro no Linux real). O patch: trocar
     `spawnSync("npx", ["tsc","--noEmit"])` por
     `spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--noEmit"])`.
3. **Extensão não aparece na UI mesmo após build OK**
   → Confirme que o Vicinae está rodando. Leia o log do app:
     `~/.local/share/vicinae/state/vicinae.log` (ou caminho equivalente no Arch)
     e procure `extension development session for "limit-tracker"`.
   → Se o log mostrar o Start/Refresh mas a UI não lista, é limitação da build
     do Vicinae (como no Windows alfa) — reporte ao usuário, não é código.
4. **Credencial não detectada**
   → Confira o path na tabela do passo 6 (pode haver `CODEX_HOME` custom, etc.).

---

## 8. Comandos de referência

```bash
npm install            # instalar deps
npm run typecheck      # tsc --noEmit
npm test               # 231 testes Node
npx vici build         # empacotar (produção)
npx vici develop       # dev session ao vivo (watch mode)
```

---

## 9. Handoff para o agente (resumo do que fazer)

Quando o usuário abrir isto no Linux e pedir ajuda:
1. Confirme pré-requisitos (passo 1).
2. `cd` na pasta, `npm install` (passo 3).
3. `npx vici develop` (passo 4) — deixe rodando.
4. Peça ao usuário abrir o Vicinae e procurar "Limit Tracker".
5. Se aparecer: validado. Se não: leia o log do app (passo 7.3) e diagnostique.
6. Opcional: rode `npm test` e `npm run typecheck` para reconfirmar verde.

**Estado final desejado:** extensão nativa listada no Vicinae Linux, 8 providers
core funcionando, v1 validada ponta a ponta.

---

## 10. Notas de ambiente (do Hermes que fez o rebuild no Windows)

- O rebuild nativo foi feito em `E:\projetos\Limit Checker\extensions\limit-tracker`.
- `tsc --noE/S` e `vici build` passaram; 231 testes verdes.
- No sandbox Windows do Hermes, `vici build` quebrava em `spawnSync('npx')`
  ENOENT (o Hermes só instala `npx` como script unix); contornado com patch no
  `build/index.js`. No Linux real isso não deve ocorrer.
- Documentação adicional (arquitetura, decisões, políticas) está num fichário
  "Limit Tracker Architecture" no **Maestri** (não disponível no Linux sem o
  Maestri) — mas este `.md` é autossuficiente.
- O usuário tem dualboot **Arch Linux + niri**; é a rota de validação de runtime.

Fim do handoff.
