// Check if an image exists
const config = {
  debug: true,
  modelBasePath: "https://vladmandic.github.io/human-models/models/",
  filter: { enabled: true, equalization: true, flip: false },
  face: {
    enabled: true,
    detector: {
      rotation: false,
      maxDetected: 100,
      minConfidence: 0.2,
      return: true,
    },
    iris: { enabled: true },
    description: { enabled: true },
    emotion: { enabled: false },
    antispoof: { enabled: true },
    liveness: { enabled: true },
  },
  body: { enabled: false },
  hand: { enabled: true },
  object: { enabled: false },
  gesture: { enabled: true },
  segmentation: { enabled: false },
};

let human = new Human.Human(config);

const gl = document.createElement('canvas').getContext('webgl');
const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) - 1000;
console.log('Max texture size:', maxTextureSize);

function toggleVisibility(hideId, showId) {
  const hideElement = document.getElementById(hideId);
  const showElement = document.getElementById(showId);

  hideElement.classList.remove("show");
  hideElement.classList.add("hidden");

  setTimeout(() => {
    showElement.classList.remove("hidden");
    showElement.classList.add("show");
  }, 100);
}

function updateProcessIndicator(step, state) {
  const stateIcons = {
    pending: "pending",
    processing: "progress_activity",
    done: "check_circle",
    error: "error",
  };

  const elementId = `state-${step}`;
  const element = document.getElementById(elementId);
  element.classList.remove("loading-icon");

  if (element && stateIcons[state]) {
    element.innerText = stateIcons[state];
  }

  if (state === "processing") {
    element.classList.add("loading-icon");
  }

  if (state === "error") {
    element.classList.add("error-icon");
  }
}

function getProcessIndicatorState(step) {
  const elementId = `state-${step}`;
  const element = document.getElementById(elementId);
  return element.innerText;
}

async function resizeImage(imageUrl, maxTextureSize) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxTextureSize || height > maxTextureSize) {
        if (width > height) {
          height *= maxTextureSize / width;
          width = maxTextureSize;
        } else {
          width *= maxTextureSize / height;
          height = maxTextureSize;
        }
      }

      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob((blob) => {
        resolve(URL.createObjectURL(blob));
      }, 'image/jpeg');
    };

    img.onerror = function (err) {
      reject(err);
    };

    img.src = imageUrl;
  });
}

async function checkImageExists(imageUrl) {
  try {
    const response = await fetch(imageUrl, { method: "HEAD" });
    return response.ok;
  } catch (err) {
    console.error("Error checking image existence:", err);
    return false;
  }
}

// Detect face in the reference image
async function referenceImageDetection() {
  updateProcessIndicator(2, "processing");

  let referenceImageUrl = "./src/images/profile.jpg";
  let imageExists = await checkImageExists(referenceImageUrl);

  if (!imageExists) {
    console.log("Reference image not found");
    updateProcessIndicator(2, "error");
    return null;
  } else {
    console.log("Reference image found");
    
    const img = new Image();
    img.src = await resizeImage(referenceImageUrl, maxTextureSize);

    await new Promise((resolve) => {
      img.onload = resolve;
    });

    console.log(" img src:", img.src);

    let referenceDetection = await human.detect(img);

    if (referenceDetection) {
      console.log("Reference Image Detections:", referenceDetection);

      if(referenceDetection.face.length == 1 || referenceDetection.persons.length == 1) {
        return referenceDetection;
      }
      console.error("No face detected in the reference image or multiple faces detected");
      return null;
    } else {
      console.error("No face detected in the reference image");
      updateProcessIndicator(2, "error");
      return null;
    }
  }
}


// Start face recognition for the uploaded image
async function startFaceRecognition(file) {
 
  // Wait for the models to load
  await human.load();

  let referenceDetections = await referenceImageDetection();
  console.log(referenceDetections);
  let detections = null;

  if (file) {
    const imgElement = document.querySelector("#div-process .pose-img");
    imgElement.src = URL.createObjectURL(file);

    try {
      
      const img = new Image();
      img.src = await resizeImage(imgElement.src, maxTextureSize);
  
      await new Promise((resolve) => {
        img.onload = resolve;
      });
  
      console.log(" img src:", img.src);

      detections = await human.detect(img);
      
      if (detections) {
        // Test 1: Face detection confidence
        console.log("Face detected, confidence:", detections);

        if(detections.face.length == 1 || detections.persons.length == 1) {
          console.log("Face detected with confidence:", detections.face[0].faceScore);
          updateProcessIndicator(1, "done");
        } else {
          updateProcessIndicator(1, "error");
          console.log("No face detected or multiple faces detected");
        }

        // Test 2: Match detected face with reference image if available
        if (referenceDetections) {
          console.log("Reference image found, matching with uploaded image...");

          const face1Embending = detections.face[0].embedding;
          const face2Embending = referenceDetections.face[0].embedding;

          const similarity = human.match.similarity(face1Embending, face2Embending);

          if (similarity && similarity < 0.3 ) {
            updateProcessIndicator(2, "error");
            console.log("Match not found with reference image" , similarity * 100);
          } else {
            updateProcessIndicator(2, "done");
            console.log(
              `Match found with reference image: (${Math.round(similarity * 100)}% confidence)`
            );
          }
        } else {
          updateProcessIndicator(2, "error");
        }

      } else {
        updateProcessIndicator(1, "error");
        console.log("No face detected");
      }
    } catch (err) {
      updateProcessIndicator(1, "error");
      console.log("Error detecting face:", err);
    }
  }

  // Test 3: Check for if image have perticular pose from Poseinput
  if(referenceDetections && detections) {

    console.log("Checking if pose is correct...");
    updateProcessIndicator(3, "processing");
    console.log(detections.gesture);

    // find pose as palm "open palm" or "facing center"

    if(detections.gesture.some((gesture) => { return (gesture.gesture == "open palm" || gesture.gesture == "facing center"); }))
      {
        console.log("Pose detected");
        updateProcessIndicator(3, "done");
      }
    else {
      updateProcessIndicator(3, "error");
    }

    if(getProcessIndicatorState(1) == "check_circle" && getProcessIndicatorState(2) == "check_circle" && getProcessIndicatorState(3) == "check_circle") {

      fetch(`http://127.0.0.1:3000/api/v1/users/0b4692b2-d9fe-4549-940e-1e96dc2b1f5d/profile-verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
      })
        .then((response) => response.json())
        .then((data) => {
          console.log(data);
          if(data.success)
          {
            toggleVisibility("div-process", "div-verify");
          }
          else{
            alert("Error:", data.message);
          }
        })
        .catch((error) => {
          console.error("Error:", error);
        });
      
    }
    else{
      // error in any one state then show card related for tips to solve tha error
      // show error card
      setTimeout(function () {
        const tipsCard = document.getElementById("state-error-tips-card");
        tipsCard.classList.add("show");

        const cancelBtn = document.getElementById("cancel-btn");
        cancelBtn.innerText = "Try again";

      }, 2000);

    }

  }
}

// Event listeners for UI controls
document.addEventListener("DOMContentLoaded", function () {
  document
    .getElementById("scan-now-btn")
    .addEventListener("click", function () {
      toggleVisibility("div-home", "div-scan");
    });

  document.getElementById("back-btn").addEventListener("click", function () {
    toggleVisibility("div-scan", "div-home");
  });

  document
    .getElementById("click-photo-btn")
    .addEventListener("click", function () {
      document.getElementById("captured-image").click();
    });

  document
    .getElementById("captured-image")
    .addEventListener("change", function () {

      const cancelBtn = document.getElementById("cancel-btn");
      cancelBtn.innerText = "Cancel";

      if (this.files.length > 0) {
        const file = this.files[0];
        const reader = new FileReader();
        reader.onload = function (e) {
          const imgElement = document.querySelector("#div-process .pose-img");
          imgElement.src = e.target.result;
          toggleVisibility("div-scan", "div-process");

          // setTimeout(function () {
          //     toggleVisibility('div-process', 'div-verify');
          // }, 5000);
        };
        reader.readAsDataURL(file);

        // Call function to update process indicator
        updateProcessIndicator(1, "processing");

        // Call function for start face recognition
        // delay 2 seconds to avaoid the jitterness
        setTimeout(() => startFaceRecognition(file), 2000);

        // Reset file input
        this.value = null;
      }
    });

  document.getElementById("cancel-btn").addEventListener("click", function () {
    toggleVisibility("div-process", "div-scan");
  });

});

document
  .getElementById("div-guidelines")
  .addEventListener("click", function () {
    document.getElementById("guidelines-card").classList.add("show");
  });

document
  .querySelector("#guidelines-card .close-btn")
  .addEventListener("click", function () {
    document.getElementById("guidelines-card").classList.remove("show");
  });

//  Close the card if clicked outside of it
document.addEventListener("click", function (event) {
  const guidelinesCard = document.getElementById("guidelines-card");
  if (
    !guidelinesCard.contains(event.target) &&
    !document.getElementById("div-guidelines").contains(event.target)
  ) {
    guidelinesCard.classList.remove("show");
  }
});

document.addEventListener("click", function (event) {
  const tipsCard = document.getElementById("state-error-tips-card");
  if (!tipsCard.contains(event.target)) {
    tipsCard.classList.remove("show");
  }
});

document
  .querySelector("#state-error-tips-card .close-btn")
  .addEventListener("click", function () {
    document.getElementById("state-error-tips-card").classList.remove("show");
  });
