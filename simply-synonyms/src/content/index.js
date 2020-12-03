import chrome from 'browserApi'
import googleDocsUtil from './siteLibs/googleDocsUtil'
import api from '../api/synonyms'
import { initializePopup, resetPopup, openPopup, getPopup, addWordsToPopup, setResultsText, stopLoading } from './popup'
import injectPageScript, { sendPageInterfaceMessage } from './util/pageInterface'
import './css/styles.css'
import './css/icons.css'

let options = {}

// Function to find selected word, fetch synonyms and open synonym popup.
function processDoubleClick (e, w) {

  // Figure out which type of element the word is in (the target). Null means the the text isn't editable
  let targetType = null
  if (window.location.hostname === 'docs.google.com') targetType = 'gdoc'
  else if (e.target.hasAttribute('contenteditable')) targetType = 'contenteditable'
  if ([ 'input', 'textarea' ].includes(e.target.nodeName.toLowerCase())) targetType = 'input'

  if (!targetType && options.option_onlyEditableText) return

  let word, selection, googleDoc
  if (targetType === 'gdoc') {
    googleDoc = googleDocsUtil.getGoogleDocument()
    word = googleDoc.selectedText
  } else {
    selection = window.getSelection()
    word = w || selection.toString().trim()
  }
  if (word.length < 2) return

  const [synonymRequestPromise, onUserCancelledRequest] = api.getSynonyms(word)

  // Don't set new position if user selected a word within popup
  if (e && !getPopup().contains(e.target)) openPopup(onUserCancelledRequest, e.clientX, e.clientY)
  else openPopup(onUserCancelledRequest)

  synonymRequestPromise
    .then((response) => {
      if (response.synonyms) {
        // TODO Click callback for contenteditable and gdoc
        const onChooseReplacementWord = (targetType !== 'input' && targetType !== 'gdoc') ? null : (wordChosen) => {
          switch (targetType) {
            case 'input':
              // Replace input text with a new string containing the chosen word
              e.target.value = e.target.value.slice(0, e.target.selectionStart) + wordChosen + e.target.value.slice(e.target.selectionEnd)
              break
            case 'gdoc':
              // Replace selected word by typing out letters in new word
              for (let i = 0; i < wordChosen.length; i++) {
                sendPageInterfaceMessage('simulateGoogleDocKeypress', { key: wordChosen[i]})
              }
          }
          resetPopup()
        }
        addWordsToPopup('synonyms', response.shortdefs, response.synonyms, onChooseReplacementWord)
        addWordsToPopup('antonyms', response.shortdefs, response.antonyms || [], onChooseReplacementWord)
      } else {
        const suffixText = targetType ? 'Are you sure you spelled it correctly?' : '' // Only show this text if the target is editable
        setResultsText(`Unable to find synonyms for "${word}". ${suffixText}`)
      }

      stopLoading()
    })
}

function addExtension() {
  injectPageScript()
  initializePopup()
  document.body.addEventListener('dblclick', processDoubleClick)
}

chrome.storage.local.get(['option_popupDisabled', 'option_onlyEditableText'], (result) => {
  options = result
  if (!result.option_popupDisabled) addExtension()
})