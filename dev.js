// Local development server — wraps the Vercel-compatible app
const app = require('./api/index');
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Local dev server running at http://localhost:${PORT}`);
  console.log(`  Signup: http://localhost:${PORT}/signup/signup.html`);
  console.log(`  Signin: http://localhost:${PORT}/signin/signin.html`);
});
