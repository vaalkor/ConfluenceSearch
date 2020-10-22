function updateSearchStatus(response)
{

  document.getElementById("resultsFailure").style.display = response.howMany === 0 ? "block" : "none";
  document.getElementById("resultsSuccess").style.display = response.howMany === 0 ? "none" : "block";

  if(response.howMany === 0) return;

  document.querySelector("#searchWord").value = response.word;
  let elem = document.querySelector("#searchState");
  elem.innerHTML = "";
  let pNode = document.createElement("p");
  let textNode = document.createTextNode(`Found ${response.howMany}. ${response.currentlySelected+1} of ${response.howMany} currently selected.`);
  pNode.appendChild(textNode);
  elem.appendChild(pNode);
}

function onSearch()
{
  let word = document.getElementById("searchWord").value;
  chrome.tabs.query({active: true, currentWindow: true}, x => {
    chrome.tabs.sendMessage(x[0].id, {searchForWord: word}, updateSearchStatus);
  })
}

function onPrevious()
{
  chrome.tabs.query({active: true, currentWindow: true}, x => {
    chrome.tabs.sendMessage(x[0].id, {previousWord: true}, updateSearchStatus);
  });
}

function onNext()
{
  chrome.tabs.query({active: true, currentWindow: true}, x => {
    chrome.tabs.sendMessage(x[0].id, {nextWord: true}, updateSearchStatus);
  });
}

function onClear()
{
  chrome.tabs.query({active: true, currentWindow: true}, x => {
    chrome.tabs.sendMessage(x[0].id, {clearSelection: true}, updateSearchStatus);
  });
}

document.querySelector("#searchButton").onclick = onSearch;
document.querySelector("#previousButton").onclick = onPrevious;
document.querySelector("#nextButton").onclick = onNext;
document.querySelector("#clearButton").onclick = onClear;

chrome.tabs.query({active: true, currentWindow: true}, x => {
  try
  {
    chrome.tabs.sendMessage(x[0].id, {getSearchStatus: true}, updateSearchStatus);
  }
  catch
  {
    window.close();
  }
});
