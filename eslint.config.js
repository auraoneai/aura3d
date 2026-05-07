export default [
  {
    ignores: ["dist/**", "node_modules/**"]
  },
  {
    files: ["**/*.ts"],
    languageOptions: {
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module"
      }
    },
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            "@galileo3d/*/src/*",
            "@galileo3d/*/*"
          ]
        }
      ]
    }
  }
];
