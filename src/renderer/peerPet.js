(() => {
  const peerName = document.getElementById('peerName');
  const peerCat = document.getElementById('peerCat');

  function applyPeer(peer) {
    if (!peer) return;
    peerName.textContent = peer.nickname || peer.userId || '好友';
    peerCat.classList.toggle('is-drag', peer.pet?.action === 'drag');
  }

  window.peerPet?.onUpdate?.(applyPeer);
})();
