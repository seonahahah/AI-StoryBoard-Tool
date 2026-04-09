export function getDeviceId(): string {
  let id = localStorage.getItem('sb_device_id');
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem('sb_device_id', id);
  }
  return id;
}
