// Optional: pnpmfile for custom package resolution if needed
// This file can be used to modify package dependencies during installation

function readPackage(pkg, context) {
  // You can modify package.json here if needed
  return pkg;
}

module.exports = {
  hooks: {
    readPackage
  }
};

