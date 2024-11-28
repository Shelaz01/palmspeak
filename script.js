const turnOnSwitch = document.getElementById("turn-on");
const aslSwitch = document.getElementById("asl-switch");
const zslSwitch = document.getElementById("zsl-switch");

turnOnSwitch.addEventListener("change", function () {
    const isOn = turnOnSwitch.checked;
    aslSwitch.disabled = !isOn;
    zslSwitch.disabled = !isOn;
});
