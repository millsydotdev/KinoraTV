# Kinora Licensing and Intellectual Property Protection

## 1. Overview and Rationale

Kinora is developed as a premium, privacy-respecting desktop media application built with React 19, TypeScript, Rust, and Tauri 2. While developed in public view to foster transparency, personal security validation, and community collaboration, Kinora is **not** an open-source project.

Kinora is published under the **Kinora Proprietary Source-Available Licence - All Rights Reserved**.

## 2. Distinction from Open-Source (OSI) Licences

- **Source-Available, Not Open Source**: The source code is publicly accessible for audit, learning, personal compilation, and legitimate bug contributions to the official repository.
- **No Commercial Exploitation Rights**: Commercialization, paid redistribution, hosting, white-labelling, and bundling are strictly prohibited without prior written consent.
- **No Derivative Releases or Redistribution**: Users may not publish, deploy, or distribute forks, ports, or rebranded versions of the application. Where hosted in a public GitHub repository, GitHub's platform fork feature is permitted solely for contributing pull requests back to the canonical repository.
- **No Rights Transfer**: Publication does not transfer or dilute the creator's exclusive copyright ownership.

## 3. Artificial Intelligence (AI) and Machine Learning (ML) Restrictions

The licence explicitly restricts the ingestion, scraping, and processing of Kinora source code, documentation, architecture diagrams, user interface layouts, and proprietary artwork for:
- Generative AI model training or pre-training.
- Supervised and unsupervised fine-tuning.
- Automated code evaluation, model benchmarking, or dataset compilation.
- Automated replication of Kinora design systems or workflows.

These restrictions apply to the fullest extent permitted by applicable law.

## 4. Brand and Trademark Protection

- **Protected Names**: "Kinora", "Kinora TV", and "KinoraTV" are proprietary brand identifiers.
- **Visual Identity**: The cinematic black-and-red visual design, custom UI components, framing artwork, and iconography constitute protected trade dress.
- **Pending Legal Review**: Formal entity incorporation and UK intellectual-property solicitor review are identified as ongoing milestones prior to commercial enterprise deployment.

## 5. Third-Party Software and Dependencies

Kinora strictly distinguishes its original proprietary source code from third-party open-source dependencies:
- Shipped runtime dependencies and fonts are documented in [public/THIRD-PARTY-NOTICES.txt](../../public/THIRD-PARTY-NOTICES.txt).
- Integrated third-party libraries are predominantly permissively licensed (MIT, Apache-2.0, BSD-2-Clause, BSD-3-Clause, ISC, Zlib, Unicode-3.0, Unlicense), alongside weak-copyleft MPL-2.0 Rust crates (`cssparser`, `cssparser-macros`, `dtoa-short`, `option-ext`, `selectors`) and SIL OFL-1.1 font packages (`@fontsource-variable/hanken-grotesk`, `@fontsource-variable/outfit`).
- MPL-2.0 covered files remain governed by the Mozilla Public License 2.0 with source availability and notice compliance maintained per MPL-2.0 Section 3.2; SIL OFL-1.1 fonts remain governed by the Open Font License 1.1.
- No strong copyleft (GPL / AGPL) components are statically linked into the Tauri release binary.
- System decoders and WebKit libraries are dynamically linked from the host operating system.

## 6. Official Creator Contact

For licensing inquiries, commercial partnerships, or written permissions, contact:
- Original Creator and Developer: **millsydotdev**
- Official GitHub Profile: https://github.com/millsydotdev
- Canonical Repository: https://github.com/millsydotdev/KinoraTV
