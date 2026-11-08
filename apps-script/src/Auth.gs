/** Вход по логину и коду, сессии и права. */

function secret_() {
  var props = PropertiesService.getScriptProperties();
  var s = props.getProperty('SESSION_SECRET');
  if (!s) { s = newId_() + newId_() + newId_(); props.setProperty('SESSION_SECRET', s); }
  return s;
}

function sign_(payload) {
  return bytesToHex_(Utilities.computeHmacSha256Signature(payload, secret_()));
}

function makeToken_(userId) {
  var exp = Date.now() + 30 * 86400000;
  var payload = userId + '.' + exp;
  return payload + '.' + sign_(payload);
}

function userFromToken_(token) {
  if (!token) return null;
  var p = String(token).split('.');
  if (p.length !== 3) return null;
  if (sign_(p[0] + '.' + p[1]) !== p[2]) return null;
  if (Number(p[1]) < Date.now()) return null;
  var u = byId_('users', p[0]);
  return u && u.active ? u : null;
}

function doLogin_(login, code) {
  var u = find_('users', function (x) { return x.login === String(login || '').trim().toLowerCase(); });
  if (!u || !u.active || !verifyCode_(String(code || '').trim(), u.codeHash)) fail_('Неверный логин или код');
  audit_(u.id, 'login', 'user', u.id);
  return { token: makeToken_(u.id) };
}

function can_(user, perm) {
  if (user.isFull) return true;
  if (perm === 'reports.view' && user.isHead) return true;
  return (user.permissions || []).indexOf(perm) >= 0;
}

function requirePerm_(user, perm) {
  if (!can_(user, perm)) fail_('Нет доступа к этому действию');
}

function canManageStaff_(manager, dept) {
  if (manager.isFull) return true;
  return manager.isHead && manager.department === dept && dept !== 'LEADERSHIP';
}

function seesOnlyOwnGroups_(user) {
  if (user.isFull || user.isHead) return false;
  return user.department === 'CURATOR' || user.department === 'TEACHER';
}

function groupVisible_(user, g) {
  if (!seesOnlyOwnGroups_(user)) return true;
  if (user.department === 'CURATOR') return g.curatorId === user.id;
  return g.chemTeacherId === user.id || g.bioTeacherId === user.id;
}

function visibleGroups_(user) {
  return where_('groups', function (g) { return groupVisible_(user, g); });
}

function taskVisible_(user, t) {
  if (t.assigneeId === user.id) return true;
  if (t.department && t.department === user.department && user.department !== 'CURATOR' && user.department !== 'TEACHER') return true;
  if (user.isFull && t.department === 'LEADERSHIP') return true;
  return false;
}

function publicUser_(u) {
  return {
    id: u.id, name: u.name, login: u.login, department: u.department, isHead: u.isHead, isFull: u.isFull,
    permissions: u.permissions, active: u.active
  };
}
