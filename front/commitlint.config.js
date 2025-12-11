module.exports = {
  extends: ["@commitlint/config-conventional"],
  parserPreset: {
    parserOpts: {
      // Regex qui accepte un emoji optionnel au début
      headerPattern: /^(?:.{0,2}\s)?(\w*)(?:\((.+)\))?!?:\s(.+)$/,
      headerCorrespondence: ["type", "scope", "subject"],
    },
  },
};
