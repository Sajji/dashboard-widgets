const baseURL = `${window.location.protocol}//${window.location.host}`;

fetch(`${baseURL}/rest/2.0/auth/sessions/current?include=user`)
  .then(r => r.json())
  .then(({ user }) => {
    document.getElementById('name').textContent = `${user.firstName} ${user.lastName}`;
    document.getElementById('avatar').textContent = user.firstName[0] + user.lastName[0];
  })
  .catch(() => {
    document.getElementById('name').textContent = 'Unable to load user';
  });
