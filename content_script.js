console.log("Confluence content script is loaded");

var _foundWords = [];
var _textNodeInfo = []; 
var _indexSpanMap = {};
var _currentWordIndex = -1;
var _searchWord = "";
var _individualHighlightColour = "#ff9600";
var _allHighlightColour = "#f8ff33";
var _currentSelectionSpan = null;

function clampNum(num, max)
{
  if(num < 0) return num + max;
  else return num % max;
}

function handleMessages(msg, sender, sendResponse)
{
  if(msg.searchForWord) 
  {
    console.log(`Received word: ${msg.searchForWord}`);
    findWord(msg.searchForWord, sendResponse);
  }
  else if(msg.clearSelection)
  {
    resetState(sendResponse);
  }
  else if(msg.nextWord || msg.previousWord)
  {
    if(msg.nextWord) _currentWordIndex = clampNum(++_currentWordIndex, _foundWords.length);
    else _currentWordIndex = clampNum(--_currentWordIndex, _foundWords.length);

    showWord(_currentWordIndex);
    sendResponse(createSearchStatusMessage());
  }
  else if(msg.getSearchStatus)
  {
    sendResponse(createSearchStatusMessage());
  }
}

function findAllSubstrings(text, searchString)
{
  let indices = [];
  let index = 0;
  let lowerText = text.toLowerCase();
  let lowerString = searchString.toLowerCase();
  while(true)
  {
    index = lowerText.indexOf(lowerString, index);
    if(index < 0) break;
    else(indices.push(index++));
  }
  return indices;
}

function findAllTextNodes(){
  let body = document.querySelector("body");
  let n, allNodes=[], walk=document.createTreeWalker(body,NodeFilter.SHOW_TEXT,null,false);
  while(n=walk.nextNode()) allNodes.push(n);
  return allNodes;
}

function calculateNavigation(textNode)
{
  let result = []
  let currentElement = textNode;
  let contentIndex = null;
  while(true)
  {
    currentElement = currentElement.parentElement;
    if(!currentElement) break;

    if(currentElement.classList.contains("tabs-pane"))
    {
      contentIndex = [...currentElement.parentElement.children].filter(x => x.classList.contains("tabs-pane")).indexOf(currentElement);
    }
    else if(currentElement.classList.contains("nav-content"))
    {
      contentIndex = [...currentElement.parentElement.children].filter(x => x.classList.contains("nav-content")).indexOf(currentElement);
    }
    else if(currentElement.classList.contains("horizontal-tabs") || currentElement.classList.contains("vertical-tabs"))
    {
      //By this point we should have already found a tabs-pane element and got the name of a tab pane. Unless the string is one of the buttons in the navlist.
      if(contentIndex !== null)
      {
        let navButton = currentElement.querySelector(".tabs-menu").children[contentIndex];
        result.push(navButton);
      }
    }
    else if(currentElement.previousElementSibling && currentElement.previousElementSibling.classList.contains("aui-navgroup-horizontal"))
    {
      if(contentIndex !== null)
      {
        let navButton = currentElement.previousElementSibling.querySelector(".aui-nav").children[contentIndex];
        result.push(navButton);
      }
    }
  }

  return result.reverse();
}

function createSearchStatusMessage()
{
  return {
    word: _searchWord,
    currentlySelected: _currentWordIndex,
    howMany: _foundWords.length
  }
}

function findWord(word, sendResponse)
{
  removeAllHighlighting();

  _searchWord = word;
  _foundWords = [];
  _textNodeInfo = [];
  let textNodes = findAllTextNodes();

  textNodes.forEach(x => {
    let foundIndices = findAllSubstrings(x.nodeValue, word);
    
    if(foundIndices.length)
    {
      let textNodeInfo = {textNode: x, foundWordIndices: foundIndices, parentElement: x.parentElement};
      _textNodeInfo.push(textNodeInfo);

      foundIndices.forEach(y => {
        _foundWords.push({
          textNodeInfo: textNodeInfo,
          parentElement: x.parentElement,
          word: word,
          textNode: x,
          index: y,
          navigation: calculateNavigation(x),
          highlightNodes: null //New nodes will be created for implementing highlighting when the word is selected.
        })
      });
    };
  });

  computeHighlightSpanIndices();
  highlightAllWords();

  if(_foundWords.length > 0)
  {
    showWord(_currentWordIndex = 0);
  } 

  sendResponse(createSearchStatusMessage());
}

//Literally half of this file is highlighting code. It's a bit of a mess to be honest. Was running out of time and really wanted it to work.
function computeHighlightSpanIndices()
{
  _indexSpanMap = {};
  let currentWordIndex = 0;
  _textNodeInfo.forEach(x => {
    let spans = [];
    let indexInSpan = 0;
    x.foundWordIndices.forEach(ind => {
      if(spans.length === 0 || spans[spans.length-1].endIndex < ind) 
      {
        indexInSpan = 0;
        spans.push({startIndex: ind, endIndex: ind+_searchWord.length, wordsInSpan: [currentWordIndex]});
      }
      else 
      {
        spans[spans.length-1].endIndex = ind+_searchWord.length;
        spans[spans.length-1].wordsInSpan.push(currentWordIndex);
      }

      _indexSpanMap[currentWordIndex] = {indexInSpan: indexInSpan};

      currentWordIndex++;
      indexInSpan++;
    });
    x.spans = spans;
  });
}

function highlightAllWords()
{
  _textNodeInfo.forEach(x => {
    let newNodes = [];
    let numSpans = x.spans.length;
    let text = x.textNode.nodeValue; 

    for(let i=0; i<numSpans; i++)
    {
      if(i === 0 && x.spans[0].startIndex > 0)
        newNodes.push(document.createTextNode(text.substring(0, x.spans[0].startIndex)));

      if(i > 0 && x.spans[i].startIndex !== x.spans[i-1])
        newNodes.push(document.createTextNode(text.substring(x.spans[i-1].endIndex, x.spans[i].startIndex)));
      
      let newSpan = createSpanTextWithColour(text.substring(x.spans[i].startIndex, x.spans[i].endIndex), _allHighlightColour);
      x.spans[i].wordsInSpan.forEach(y => _indexSpanMap[y].span = newSpan);
      
      newNodes.push(newSpan);
    }

    if(x.spans[numSpans-1].endIndex !== text.length)
      newNodes.push(document.createTextNode(text.substring(x.spans[numSpans-1].endIndex, text.length)));

    newNodes.forEach(n => {
      x.parentElement.insertBefore(n, x.textNode);
    });
    x.parentElement.removeChild(x.textNode);
    x.newNodes = newNodes;
  });
}

function showWord(foundWordIndex)
{
  _foundWords[foundWordIndex].navigation.forEach(x => x.click());
  let elem = _foundWords[foundWordIndex].parentElement;

  highlightWord(foundWordIndex);

  if(!isElementInViewport(elem))
  {
    elem.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'center'
    });
  }
}

function highlightWord(wordIndex)
{ 
  if(_currentSelectionSpan)
  {
    [..._currentSelectionSpan.parentElement.children].filter(x => x.nodeType === 1).forEach(x => x.style.display = "inline");
    _currentSelectionSpan.parentElement.removeChild(_currentSelectionSpan);
  }

  let span = _indexSpanMap[wordIndex].span;
  let indexInSpan = _indexSpanMap[wordIndex].indexInSpan;
  
  let newSpan = createSubSpan(span, indexInSpan);
  span.parentElement.insertBefore(newSpan, span);
  span.style.display = "none";

  _currentSelectionSpan = newSpan;
}

function removeAllHighlighting()
{
  if(_currentSelectionSpan)
  {
    [..._currentSelectionSpan.parentElement.children].filter(x => x.nodeType === 1).forEach(x => x.style.display = "inline");
    _currentSelectionSpan.parentElement.removeChild(_currentSelectionSpan);
    _currentSelectionSpan = null;
  }
  _textNodeInfo.forEach(x => {
    x.parentElement.insertBefore(x.textNode, x.newNodes[0]);
    x.newNodes.forEach(n => {
      x.parentElement.removeChild(n);
    })
  })
}

function resetState(sendResponse)
{
  removeAllHighlighting();  

  _searchWord = "";
  _currentWordIndex = -1;
  _foundWords = [];
  _textNodeInfo = [];

  sendResponse(createSearchStatusMessage());
}

function createSubSpan(oldSpan, indexInSpan)
{
  let newSpan = document.createElement("span");
  newSpan.style.backgroundColor = _allHighlightColour;

  let wordIndex = findAllSubstrings(oldSpan.innerText, _searchWord)[indexInSpan];

  let beforeString = oldSpan.innerText.substring(0, wordIndex);
  let afterString = oldSpan.innerText.substring(wordIndex + _searchWord.length, oldSpan.innerText.length);

  if(beforeString)  newSpan.appendChild(document.createTextNode(beforeString));

  newSpan.appendChild(createSpanTextWithColour(oldSpan.innerText.substring(wordIndex, wordIndex + _searchWord.length), _individualHighlightColour));

  if(afterString)   newSpan.appendChild(document.createTextNode(afterString));

  return newSpan;
}

function createSpanTextWithColour(text, colour)
{
  let spanElement = document.createElement("span");
  spanElement.style.backgroundColor = colour;
  spanElement.appendChild(document.createTextNode(text));
  return spanElement;
}

function isElementInViewport (el) 
{
  let rect = el.getBoundingClientRect();

  return (
      rect.top >= 0 &&
      rect.left >= 0 &&
      rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
      rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

chrome.runtime.onMessage.addListener(handleMessages);
