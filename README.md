# Garagem Perfect Car | UTV em 3D

Demonstração: escolha do UTV e do stage do som, apresentação 3D guiada pela rolagem e aba Visualizador com câmera livre.

## Rodar no computador

```
npm install
npm run dev
```

## Publicar no GitHub Pages

```
npm run deploy
```

Publica a pasta `dist` na branch `gh-pages`. Em Settings > Pages, a fonte deve ser a branch `gh-pages`.

## O que editar

- Número de WhatsApp: constante `WHATSAPP_NUMBER` em `src/main.ts` (só dígitos, com DDI e DDD).
- Modelos de UTV e stages: listas `UTVS` e `STAGES` em `src/main.ts`.
- Modelo 3D: `public/models/maverick.glb`.
- Painel de som 3D (guardado, fora do site): `_guardado/painel-de-som.ts`.

## Créditos

Modelo 3D "CAN AM maverick" por [AGRO-3D](https://sketchfab.com/AGRO-3D), licença [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/), via Sketchfab. O crédito aparece no rodapé do site e deve ser mantido.
