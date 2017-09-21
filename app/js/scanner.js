const WorkerUrl = "decoder.min.js";

export default class Scanner {
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.onstart = (stream) => {};
    this.onstop = () => {};
    this.onerror = (err) => {};
    this.onsuccess = (evt) => {};
    this.canvas = null;
    this.context = null;
    this.scanInterval = 1;
    this.init();
  }

  start() {
    return this.calculateConstraints()
    .then(constraints => {
      navigator.mediaDevices
        .getUserMedia(constraints)
        .then((stream) => {
          this.stream = stream;
          this.video.srcObject = stream;
          if (this.onstart) {
            this.onstart(stream);
          }
          this.scan();
        })
        .catch(this.error("Error starting"));
    });
  }

  stop() {
    if (this.stream) {
      this.stream.getTracks()[0].stop();
      this.stream = null;
    }
    if (this.onstop) {
      this.onstop();
    }
  }

  error(msg = 'An error happened') {
    return (err) => {
      console.error(msg, err);
      if (this.onerror) {
        this.onerror(err);
      }
    };
  }

  get active() {
    return this.stream !== null;
  }

  init() {
    if (!this.supported()) {
      return false;
    }

    this.canvas = document.createElement('canvas');
    this.context = this.canvas.getContext('2d');

    this.decoder = new Worker(WorkerUrl);
    this.decoder.onmessage = (event) => this.onmessage(event);
  }


  supported() {
    return navigator.mediaDevices
      && navigator.mediaDevices.getUserMedia
      && Worker;
  }

  getVideoTrack() {
    if (!this.stream || !this.stream.active) {
      return null;
    }
    const tracks = this.stream.getVideoTracks();
    return (tracks.length > 0) ? tracks[0] : null;
  }

  scan() {
    if (!this.stream || !this.stream.active) {
      console.log("Stream inactive. Bailing", this.stream);
      return;
    }

    const track = this.getVideoTrack();

    if (!track) {
      this.rescan();
      return;
    }

    try {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight;
      this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      const imgData = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);
      if (imgData.data) {
        this.decoder.postMessage(imgData);
      }
    } catch (err) {
      this.error("Error scanning")(err);
      this.rescan();
    }
  }

  rescan() {
    setTimeout(_ => this.scan(), this.scanInterval);
  }

  onmessage(event) {
    if (event.data.length > 0 && this.onsuccess) {
      this.onsuccess(event);
    }
    this.rescan();
  }

  calculateConstraints() {
    return navigator.mediaDevices.enumerateDevices()
    .then((devices) =>  {
      const videos = devices.filter((d) => d.kind == 'videoinput');
      let source = null;

      if (videos.length === 1) {
        source = videos[0];
      } else if (videos.length > 1) {
        source = videos[1];
      }

      if (!source || !source.deviceId) {
        return {video: true, audio: false};
      }

      return {
        video: {mandatory: {sourceId: source.deviceId}},
        audio: false
      };
    })
    .catch(this.error("Error getting constraints"));
  }
}
