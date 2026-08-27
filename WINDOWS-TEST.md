# Testando a extensão Limit Tracker no Windows (Vicinae 0.27.1)

> **Documento de handoff para outros agentes (Hermes ou humanos).** Autossuficiente:
> não depende de notas externas (Maestri/fichário). Se você está no Windows com o
> Vicinae 0.27.1 e precisa validar/rodar esta extensão nativa, siga da seção 0 em diante.

---

## 0. Contexto rápido

- **Projeto:** `limit-tracker` — extensão nativa do *Vicinae* (launcher tipo Raycast, C++/React/QML)
  que monitora limites de uso de 8 provedores de IA: Claude, Codex, Copilot, Cursor, DeepSeek,
  Gemini, OpenCode Go e z.ai. Fork nativizado de uma extensão Raycast (usa **`@vicinae/api`**, nunca
  `@raycast/api`).
- **Onde está o código:** pasta da extensão (este repo), com `package.json` nativo, `src/` (TS/React),
  `assets/` (SVGs/PNGs dos ícones).
- **App alvo:** Vicinae **0.27.1** (pre-1.0, alfa). Build baixada de
  `github.com/vicinaehq/vicinae/actions/runs/33008691144` (commit `1484d8fe`, "build(appimage): enforce PIE").
- **O que JÁ foi validado sem o app:** `tsc --noEmit` (limpo), `vici build` (ok),
  `node --test` (231 testes, 0 fail).
- **O que este doc resolve:** como fazer a extensão **aparecer e rodar** no Windows, que tem 2 armadilhas
  que não existem no Linux/macOS.

---

## 1. PRÉ-REQUISITOS

1. **Vicinae 0.27.1 instalado** no Windows (baixe a build de
   `github.com/vicinaehq/vicinae/actions/runs/33008691144` → aba *Artifacts* →
   `vicinae-windows-x64-setup` ou `vicinae-windows-x64-portable`). Exige login no GitHub para baixar.
2. **Node** presente (o app embarca um node pinado v22.23.1 para rodar extensões; para o `vici` CLI
   local você usa o node do sistema).
3. **`vici` CLI** disponível. No Windows ele vem com o pacote `@vicinae/api` (`node_modules/.bin/vici`).
   O binário do app `vicinae.exe` fica em:
   `C:\Users\<user>\AppData\Local\Programs\Vicinae\bin\vicinae.exe`
   → adicione essa pasta ao `PATH` para poder rodar `vici develop`/`vici build` e `vicinae` (ping).
4. **Dependências da extensão instaladas:** `npm install` na pasta da extensão (precisa de
   `@vicinae/api`, `@bufbuild/protobuf`, `typescript`).

> Nota: o `vici build` do `@vicinae/api` pode falhar com `spawnSync('npx') ENOENT` em alguns
> sandboxes. Se isso acontecer, patch em
> `node_modules/@vicinae/api/dist/commands/build/index.js` (linha ~129): troque
> `spawnSync("npx", ["tsc", "--noEmit"])` por
> `spawnSync(process.execPath, [require.resolve("typescript/bin/tsc"), "--noEmit"])`.
> (Esse patch some a cada `npm install`; refaça se necessário.)

---

## 2. ARMADILHA 1 — o app lê de `Local\data`, mas o `vici develop` grava em `Roaming`

**Este é o motivo principal de "a extensão não aparece".**

- O `vici develop` (e o `vici build`) gravam o bundle em:
  `C:\Users\<user>\AppData\Roaming\vicinae\extensions\limit-tracker\`
- Mas o **app 0.27.1 carrega extensões de**:
  `C:\Users\<user>\AppData\Local\vicinae\data\extensions\limit-tracker\`

No Windows esses dois caminhos são diferentes. O app registra a "dev session" (log:
`Start extension development session for "limit-tracker"`) mas **nunca copia** o bundle para onde ele
de fato lê → a extensão não lista na UI.

**Sintoma no log do app** (`C:\Users\<user>\AppData\Local\vicinae\state\vicinae.log`):
```
info  - Start extension development session for "limit-tracker"
info  - Refreshing extension development for "limit-tracker"
```
...mas a extensão não aparece na busca (Alt+Space).

**Resolução (contorno para 0.27.1):** após o build, copie a pasta manualmente para o diretório que o
app lê, e **remova** a de `Roaming` (senão o app lista duas vezes — ver Armadilha 3).

```powershell
# do PowerShell ou bash (git-bash usa /c/Users/...):
# 1) builda (grava em Roaming)
node node_modules/@vicinae/api/bin/run.js build
# 2) copia para o dir que o app efetivamente carrega
rm -rf "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
cp -r  "$APPDATA/vicinae/extensions/limit-tracker" "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
# 3) remove de Roaming para não duplicar
rm -rf "$APPDATA/vicinae/extensions/limit-tracker"
```

> `$APPDATA` = `C:\Users\<user>\AppData\Roaming`
> `$LOCALAPPDATA` = `C:\Users\<user>\AppData\Local`

Depois disso, abra o Vicinae (Alt+Space) e procure por **"Limit Tracker"** — deve aparecer.

---

## 3. ARMADILHA 2 — `package.json` não pode ter `"type": "module"`

O `vici build` gera o bundle em **CommonJS** (`format: "cjs"` no esbuild interno). Se o `package.json`
da extensão tiver `"type": "module"`, o Node do app (v22) carrega o `.js` como ES Module e quebra:

```
error - Got crash "ReferenceError: module is not defined in ES module scope
This file is being treated as an ES module because it has a '.js' file extension and
'.../package.json' contains "type": "module"."
Worker limit-tracker:agent-usage exited with code 1
Extension exited prematurely with exit code 1
```

**Resolução:** o `package.json` da extensão **NÃO deve** conter `"type": "module"`. O manifest oficial
do Vicinae (docs.vicinae.com/extensions/create) não tem esse campo. Remover não afeta `tsc` nem os
testes Node (que usam tsconfig/flags próprias) — só muda como o app carrega o bundle.

**Outro campo obrigatório do schema:** o `vici build` exige `"author"` (string). Se ausente:
```
error - .../package.json is not a valid extension manifest:
[{"expected":"string","code":"invalid_type","path":["author"],...}]
```
Adicione `"author": "<seu-usuario>"` e `"contributors": []` para espelhar o exemplo oficial.

---

## 4. ARMADILHA 3 — "nome duplicado" (view + menubar)

O manifest tem **2 comandos**:
```json
"commands": [
  { "name": "agent-usage",       "title": "Limit Tracker" },
  { "name": "agent-usage-menubar","title": "Limit Tracker Menu Bar" }
]
```
O app lista **ambos** na busca (root search). Como os títulos são parecidos, parece "duplicado", mas é
o comando de **lista** + o de **menu-bar** — comportamento correto.

Se aparecer **mais de 2 entradas** ou o mesmo nome 2x, a causa é a **Armadilha 1**: a extensão está em
`Roaming` **e** em `Local\data` ao mesmo tempo (o app lê os dois). Resolva copiando para `Local\data`
e removendo de `Roaming` (seção 2).

Para **não** mostrar o menu-bar na busca: remova o comando `agent-usage-menubar` do manifest, ou
(quando a API permitir) marque-o como menu-bar only.

---

## 5. O que a extensão faz (para validar)

Ao abrir "Limit Tracker" (lista) e selecionar um provider (painel à direita):

- **Claude:** Plan, 5h Limit (% + barra), Weekly Limit (% + barra), **Resets In** (countdown ao vivo,
  dias/horas/minutos), sub-seções por modelo (`modelWindows`, ex.: "Weekly Sonnet") cada uma com seu
  próprio Resets In, e Extra Usage.
- **Codex:** 5h / Weekly / Code Review limits (cada um com Resets In ao vivo), créditos, e **banco de
  resets** (`resetCredits`: "Limit Reset Credits: N manual resets available" + expiração).
- **Copilot / Cursor / DeepSeek / Gemini / OpenCode Go / z.ai:** uso/percentual conforme disponível.

**Countdown ao vivo:** implementado em `src/agents/countdown.tsx` (`LiveResetLabel`) — timer React que
decrementa e formata em **dias/horas/minutos (sem segundos)**, exatamente como o Raycast
("Resets In: 6d 18h"). O Codex já trazia `resetsInSeconds` (número); o Claude foi ajustado no fetcher
para também expor `resetsInSeconds` (derivado do `resets_at` ISO que a API retorna).

---

## 6. PROCEDIMENTO DE TESTE (passo a passo)

```bash
# 0) pré-reqs: Vicinae 0.27.1 instalado; node no PATH; vici no PATH
export PATH="$PATH:/c/Users/Administrator/AppData/Local/Programs/Vicinae/bin"

# 1) instalar deps (primeira vez)
npm install

# 2) typecheck + testes (validação sem app)
npx --no-install tsc --noEmit      # esperado: exit 0
node --test --experimental-strip-types $(find src -name '*.test.ts')   # esperado: 0 fail

# 3) build (grava em Roaming)
node node_modules/@vicinae/api/bin/run.js build   # esperado: "built extension successfully"

# 4) contorno da Armadilha 1: copiar para Local/data e limpar Roaming
rm -rf "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
cp -r  "$APPDATA/vicinae/extensions/limit-tracker" "$LOCALAPPDATA/vicinae/data/extensions/limit-tracker"
rm -rf "$APPDATA/vicinae/extensions/limit-tracker"

# 5) abrir o Vicinae e testar
#    - Alt+Space → procurar "Limit Tracker"
#    - deve aparecer (1x lista + 1x menu-bar, não duplicado do mesmo)
#    - selecionar Claude/Codex → ver "Resets In" contando ao vivo (sem segundos)
#    - Codex → ver "Limit Reset Credits" (banco de resets)
```

**Validação de sucesso:**
- [ ] Extensão aparece na busca sem crash (`exit code 1`).
- [ ] Apenas os 2 comandos esperados (não duplicação do mesmo nome).
- [ ] "Resets In" decrementa ao vivo (dias/horas/minutos).
- [ ] Claude mostra modelWindows; Codex mostra resetCredits.

---

## 7. TROUBLESHOOTING

| Sintoma | Causa | Fix |
|---|---|---|
| Extensão não aparece | Armadilha 1 (app lê `Local\data`, CLI grava `Roaming`) | Copiar p/ `Local\data`, limpar `Roaming` (seção 2) |
| `Extension exited prematurely with exit code 1` + `module is not defined` | `package.json` com `"type":"module"` | Remover `"type":"module"` (seção 3) |
| `manifest: expected string, received undefined` (path `author`) | falta campo `author` | Adicionar `"author"` + `"contributors":[]` (seção 3) |
| Nome aparece 2x (mesmo nome) | extensão em `Roaming` E `Local\data` | Limpar `Roaming` (seção 2/4) |
| `vici develop` trava / ENOENT vicinae | `vicinae.exe` fora do PATH | Adicionar `Programs\Vicinae\bin` ao PATH |
| `spawnSync('npx') ENOENT` no build | sandbox sem `npx` executável | Patch `build/index.js` (seção 1) |

**Logs úteis:**
- App: `C:\Users\<user>\AppData\Local\vicinae\state\vicinae.log` (grep por `limit-tracker`, `exited`, `prematurely`)
- Dev session (quando usa `vici develop`): `Roaming\vicinae\extensions\limit-tracker\dev.log`

---

## 8. NOTAS PARA OUTROS AGENTES

- **Não use `vici develop` sozinho no Windows 0.27.1** para validar UI — ele grava no lugar errado.
  Use `vici build` + cópia manual para `Local\data\extensions` (seção 2). No Linux/macOS o fluxo
  `vici develop` deve funcionar direto (onde o suporte a extensões é mais maduro); ver `LINUX-TEST.md`.
- **O código é cross-platform** (os fetchers brancham `win32`/`darwin`/`linux` via `os.homedir()` e
  env). Nenhuma mudança de código é necessária para rodar no Linux.
- **Créditos:** os provedores sem token configurado mostram estado "Not Configured" (esperado). Para
  testar de verdade, configure as credenciais de cada provedor no sistema (ver `LINUX-TEST.md` para os
  caminhos no Linux; no Windows são análogos: `CLAUDE_CONFIG_DIR`, Credential Manager, etc.).
- **Contribuição:** ao enviar a extensão, ela provavelmente vai para o repositório de *extensões* do
  Vicinae (você vira contribuidor desse repo), não para o core `vicinaehq/vicinae`. Confirmar via
  docs.vicinae.com/extensions (seção de publishing) — não verificado oficialmente.

---

## 9. ARQUIVOS RELEVANTES (nesta extensão)

- `package.json` — manifesto nativo (sem `type:module`, com `author`/`contributors`)
- `src/agents/countdown.tsx` — `LiveResetLabel` (countdown ao vivo, d/h/m)
- `src/claude/fetcher.ts` — `formatResetsIn` agora retorna `{text, seconds}`
- `src/claude/types.ts` — `ClaudeRateWindow.resetsInSeconds`
- `src/claude/renderer.tsx`, `src/codex/renderer.tsx` — usam `LiveResetLabel` no "Resets In"
- `LINUX-TEST.md` — guia de validação no Linux (Arch + niri)
