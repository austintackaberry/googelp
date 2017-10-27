import React, { Component } from 'react';
import './App.css';
var loadjs = require('loadjs');
var async = require('async');

function getDistanceFromLatLonInM(lat1,lon1,lat2,lon2) {
  var R = 6371; // Radius of the earth in km
  var dLat = deg2rad(lat2-lat1);  // deg2rad below
  var dLon = deg2rad(lon2-lon1);
  var a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
    Math.sin(dLon/2) * Math.sin(dLon/2)
    ;
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  var d = R * c; // Distance in km
  return d*1000;
}

function deg2rad(deg) {
  return deg * (Math.PI/180)
}

function placeMatch(googlePlace, yelpPlace) {
  var gyDist = getDistanceFromLatLonInM(googlePlace.location.lat,googlePlace.location.lng,yelpPlace.location.lat,yelpPlace.location.lng);
  if (gyDist > 100) {
    return false;
  }
  if (gyDist < 10) {
    return true;
  }
  var googleNameArr = googlePlace.name.split(' ');
  var yelpNameArr = yelpPlace.name.split(' ');
  var i = 0;
  var nameMatch = 0;
  while (i < Math.min(googleNameArr.length, yelpNameArr.length)){
    if (googleNameArr[i] == yelpNameArr[i]) {
      nameMatch++;
    }
    i++;
  }
  if (nameMatch === i) {
    return true;
  }
  var googleAddressArr = googlePlace.address.split(' ');
  var yelpAddressArr = yelpPlace.address.split(' ');
  if (googleAddressArr[1] !== yelpAddressArr[1]) {
    return false;
  }
  var j = 0;
  var addressMatch = 0;
  while (j < 2){
    if (googleAddressArr[j] == yelpAddressArr[j]) {
      addressMatch++;
    }
    j++;
  }

  if (addressMatch === 2) {
    return true;
  }

  if (nameMatch/i*1.0 < 0.5) {
    return false;
  }
  return true;
}

function formatGoogleResults(googlePlacesResults, bounds, googlePlaces) {
  for (var i = 0; i < googlePlaces.length; i++) {
    if (googlePlaces[i].geometry.location.lat > bounds.lat.min && googlePlaces[i].geometry.location.lat < bounds.lat.max && googlePlaces[i].geometry.location.lng > bounds.lon.min && googlePlaces[i].geometry.location.lng < bounds.lon.max) {
      var priceLevel = '$'.repeat(googlePlaces[i].price_level);
      if (googlePlaces[i].price_level == 0) {
        priceLevel = '$';
      }
      var currStatus;
      if (googlePlaces[i].opening_hours !== undefined) {
        if (googlePlaces[i].opening_hours.open_now) {
          currStatus = 'Open now'
        }
        else {
          currStatus = 'Closed now'
        }
      }
      var latitude = (bounds.lat.min + bounds.lat.max) / 2.0;
      var longitude = (bounds.lon.min + bounds.lon.max) / 2.0;
      var distance = getDistanceFromLatLonInM(latitude, longitude, googlePlaces[i].geometry.location.lat, googlePlaces[i].geometry.location.lng);
      var address = googlePlaces[i].vicinity;
      var place = {
        name: googlePlaces[i].name,
        location: googlePlaces[i].geometry.location,
        address: address,
        rating: googlePlaces[i].rating,
        priceLevel: priceLevel,
        currStatus: currStatus,
        distance: distance,
        url: 'https://www.google.com/maps/search/?api=1&query=Google&query_place_id=' + googlePlaces[i].place_id
      };
      googlePlacesResults.push(place);
    }
  }
  return googlePlacesResults;
}

class App extends Component {
  constructor() {
    super();
    this.state = {
      googlePlacesResults: [],
      yelpPlacesResults: [],
      bothPlacesResults: [],
      currentGooglePlaces: [],
      currentYelpPlaces: [],
      sortStatus: 0,
      filterStatus: [false,true,true,true]
    }
    this.markers = [];
    this.maxLength = 15;
    this.initMap = this.initMap.bind(this);
    this.handleSearchClick = this.handleSearchClick.bind(this);
    this.handleSubmit = this.handleSubmit.bind(this);
    this.handleChange = this.handleChange.bind(this);
    this.handleScroll = this.handleScroll.bind(this);
    this.handleSortClick = this.handleSortClick.bind(this);
    this.handleFilterClick = this.handleFilterClick.bind(this);
    this.filterResults = this.filterResults.bind(this);
    this.sortResults = this.sortResults.bind(this);
    this.makeMarkers = this.makeMarkers.bind(this);
    this.addMarkerListener = this.addMarkerListener.bind(this);
  }

  componentDidMount() {
    window.initMap = this.initMap;
    loadjs('https://maps.googleapis.com/maps/api/js?key=AIzaSyCkzLkLAJ_ZRGvaAg2c9R2sC_n-OHLq-x8&libraries=places&callback=initMap');
    window.addEventListener('scroll', this.handleScroll);
  }

  handleScroll() {
    var rect = this.stickyWrapper.getBoundingClientRect();
    if (rect.top <= 0) {
      this.placeHolder.style.height = this.stickyWrapper.clientHeight+"px";
      this.placeHolder.style.width = "100%";
      this.stickyWrapper.classList.add("sticky");
    }
    if (window.scrollY <= 150 && this.stickyWrapper.classList.contains("sticky")){
      this.stickyWrapper.classList.toggle("sticky");
      this.placeHolder.style.height = "0";
      this.placeHolder.style.width = "0";
    }
  }

  initMap() {
    const google = window.google;
    var map = new google.maps.Map(this.map, {
      zoom: 11,
      mapTypeId: 'roadmap',
      gestureHandling: 'greedy'
    });
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(function (position) {
        var initialLocation = new google.maps.LatLng(position.coords.latitude, position.coords.longitude);
        map.setCenter(initialLocation);
      }, function() {
        map.setCenter({lat: 37.8667517, lng: -122.259986});
      });
    }
    else {
      map.setCenter({lat: 37.8667517, lng: -122.259986});
    }
    this.setState({map:map});
    this.locationBox = new google.maps.places.SearchBox(this.locationBoxEl);
    this.searchBox = new google.maps.places.SearchBox(this.searchBoxEl);
    this.icons = {
      google: {
        icon: {
          url: '/google_logo.png',
          scaledSize: new google.maps.Size(25, 25),
          origin: new google.maps.Point(0, 0),
          anchor: new google.maps.Point(0, 0)
        }
      },
      yelp: {
        icon: {
          url: '/yelp_logo.png',
          scaledSize: new google.maps.Size(25, 25),
          origin: new google.maps.Point(0, 0),
          anchor: new google.maps.Point(0, 0)
        }
      },
      yeggle: {
        icon: {
          url: '/yeggle.png',
          scaledSize: new google.maps.Size(30, 30),
          origin: new google.maps.Point(0, 0),
          anchor: new google.maps.Point(0, 0)
        }
      }
    };
    this.infoWindow = new google.maps.InfoWindow;
  }

  handleSearchClick() {
    if (this.state.map !== undefined || this.state.map !== null) {
      this.searchBox.setBounds(this.state.map.getBounds());
      this.places = this.searchBox.getPlaces();
      this.setState({
        searchBounds:this.state.map.getBounds()
      });
    }
  }

  sortResults(currentYelpPlaces, currentGooglePlaces, sortState) {
    var yeggle = this.state.filterStatus[0];
    if (sortState === 0) {
      return [currentYelpPlaces, currentGooglePlaces];
    }
    if (yeggle) {
      var yeggleArr = [];
      for (var i = 0; i < currentYelpPlaces.length; i++) {
        yeggleArr.push({
          yelp: currentYelpPlaces[i],
          google: currentGooglePlaces[i]
        });
      }
    }
    if (sortState === 1) {
      if (yeggle) {
        yeggleArr = yeggleArr.sort(function(a, b) {
          if (a.yelp.reviewCount === b.yelp.reviewCount) {
            return b.yelp.rating - a.yelp.rating;
          }
          return b.yelp.reviewCount - a.yelp.reviewCount;
        });
      }
      else {
        currentYelpPlaces = currentYelpPlaces.sort(function(a, b) {
          if (a.reviewCount === b.reviewCount) {
            return b.rating - a.rating;
          }
          return b.reviewCount - a.reviewCount;
        });
      }
    }
    else if (sortState === 2) {
      if (yeggle) {
        yeggleArr = yeggleArr.sort(function(a, b) {
          if (a.yelp.rating === b.yelp.rating) {
            return b.yelp.reviewCount - a.yelp.reviewCount;
          }
          return b.yelp.rating - a.yelp.rating;
        });
      }
      else {
        currentYelpPlaces = currentYelpPlaces.sort(function(a, b) {
          if (a.rating === b.rating) {
            return b.reviewCount - a.reviewCount;
          }
          return b.rating - a.rating;
        });
        currentGooglePlaces = currentGooglePlaces.sort(function(a, b) {
          return b.rating - a.rating;
        });
      }
    }
    else if (sortState === 3) {
      if (yeggle) {
        yeggleArr = yeggleArr.sort(function(a, b) {
          return a.yelp.distance - b.yelp.distance;
        });
      }
      else {
        currentYelpPlaces = currentYelpPlaces.sort(function(a, b) {
          return a.distance - b.distance;
        });
        currentGooglePlaces = currentGooglePlaces.sort(function(a, b) {
          return a.distance - b.distance;
        });
      }
    }
    if (yeggle) {
      currentGooglePlaces = [];
      currentYelpPlaces = [];
      for (var i = 0; i < yeggleArr.length; i++) {
        currentYelpPlaces.push(yeggleArr[i].yelp)
        currentGooglePlaces.push(yeggleArr[i].google)
      }
    }
    return [currentYelpPlaces, currentGooglePlaces];
  }

  handleSortClick(buttonNum) {

    var children = this.sortGroup.children;
    for (var i = 0; i < children.length; i++) {
      children[i].classList.remove("sort-button-clicked");
    }
    var tempPlaceArray;
    var yelpPlacesResults = this.state.yelpPlacesResults.slice();
    var googlePlacesResults = this.state.googlePlacesResults.slice();
    var bothPlacesResults = this.state.bothPlacesResults.slice();
    var currentYelpPlaces = this.state.currentYelpPlaces.slice();
    var currentGooglePlaces = this.state.currentGooglePlaces;
    if (buttonNum === 0) {
      this.sortBestMatch.classList.add("sort-button-clicked");
      var filterState = this.state.filterStatus;
      tempPlaceArray = this.filterResults(yelpPlacesResults, googlePlacesResults, bothPlacesResults, filterState);
      currentYelpPlaces = tempPlaceArray[0].slice();
      currentGooglePlaces = tempPlaceArray[1];
    }
    else if (buttonNum === 1) {
      this.sortReview.classList.add("sort-button-clicked");
    }
    else if (buttonNum === 2) {
      this.sortRating.classList.add("sort-button-clicked");
    }
    else if (buttonNum === 3) {
      this.sortDistance.classList.add("sort-button-clicked");
    }
    this.setState({sortStatus:buttonNum});
    var temp1PlaceArray = this.sortResults(currentYelpPlaces, currentGooglePlaces, buttonNum);
    currentYelpPlaces = temp1PlaceArray[0].slice();
    currentGooglePlaces = temp1PlaceArray[1].slice();
    this.makeMarkers(currentYelpPlaces, currentGooglePlaces);
    this.setState({currentYelpPlaces:currentYelpPlaces, currentGooglePlaces:currentGooglePlaces});
  }

  filterResults(yelpPlacesResults, googlePlacesResults, bothPlacesResults, filterState) {
    var currentYelpPlaces = yelpPlacesResults.slice();
    var currentGooglePlaces = googlePlacesResults.slice();
    var priceLevel;
    var yeggle = filterState[0];
    if (yeggle) {
      currentYelpPlaces = [];
      currentGooglePlaces = [];
      for (var i = 0; i < bothPlacesResults.length; i++) {
        currentYelpPlaces.push(bothPlacesResults[i].yelp);
        currentGooglePlaces.push(bothPlacesResults[i].google);
      }
    }
    if (filterState[1] === false) {
      priceLevel = "$";
      var i = 0;
      while (i < currentYelpPlaces.length) {
        if (currentYelpPlaces[i].priceLevel === priceLevel) {
          if (yeggle) {
            if (currentGooglePlaces[i].priceLevel === priceLevel) {
              currentGooglePlaces.splice(i,1);
              currentYelpPlaces.splice(i,1);
            }
            else {
              i++;
            }
          }
          else {
            currentYelpPlaces.splice(i,1);
          }
        }
        else {
          i++;
        }
      }
      i = 0;
      while (i < currentGooglePlaces.length) {
        if (currentGooglePlaces[i].priceLevel === priceLevel) {
          if (!yeggle) {
            currentGooglePlaces.splice(i,1);
          }
          else {
            i++;
          }
        }
        else {
          i++;
        }
      }
    }
    if (filterState[2] === false) {
      priceLevel = "$$";
      i = 0;
      while (i < currentYelpPlaces.length) {
        if (currentYelpPlaces[i].priceLevel === priceLevel) {
          if (yeggle) {
            if (currentGooglePlaces[i].priceLevel === priceLevel) {
              currentGooglePlaces.splice(i,1);
              currentYelpPlaces.splice(i,1);
            }
            else {
              i++;
            }
          }
          else {
            currentYelpPlaces.splice(i,1);
          }
        }
        else {
          i++;
        }
      }
      i = 0;
      while (i < currentGooglePlaces.length) {
        if (currentGooglePlaces[i].priceLevel === priceLevel) {
          if (!yeggle) {
            currentGooglePlaces.splice(i,1);
          }
          else {
            i++;
          }
        }
        else {
          i++;
        }
      }
    }
    if (filterState[3] === false) {
      priceLevel = "$$$";
      i = 0;
      while (i < currentYelpPlaces.length) {
        if (currentYelpPlaces[i].priceLevel === priceLevel) {
          if (yeggle) {
            if (currentGooglePlaces[i].priceLevel === priceLevel) {
              currentGooglePlaces.splice(i,1);
              currentYelpPlaces.splice(i,1);
            }
            else {
              i++;
            }
          }
          else {
            currentYelpPlaces.splice(i,1);
          }
        }
        else {
          i++;
        }
      }
      i = 0;
      while (i < currentGooglePlaces.length) {
        if (currentGooglePlaces[i].priceLevel === priceLevel) {
          if (!yeggle) {
            currentGooglePlaces.splice(i,1);
          }
          else {
            i++;
          }
        }
        else {
          i++;
        }
      }
    }
    return [currentYelpPlaces, currentGooglePlaces];
  }

  handleFilterClick(filterNum) {
    var filterState = this.state.filterStatus;
    if (filterState[filterNum]) {
      filterState[filterNum] = false;
      this.setState({filterStatus:filterState});
      if (filterNum === 0) {
        this.filterYeggle.classList.remove("filter-button-clicked");
      }
      else if (filterNum === 1) {
        this.filterPrice1.classList.remove("filter-button-clicked");
      }
      else if (filterNum === 2) {
        this.filterPrice2.classList.remove("filter-button-clicked");
      }
      else if (filterNum === 3) {
        this.filterPrice3.classList.remove("filter-button-clicked");
      }
    }
    else {
      filterState[filterNum] = true;
      this.setState({filterStatus:filterState});
      if (filterNum === 0) {
        this.filterYeggle.classList.add("filter-button-clicked");
      }
      else if (filterNum === 1) {
        this.filterPrice1.classList.add("filter-button-clicked");
      }
      else if (filterNum === 2) {
        this.filterPrice2.classList.add("filter-button-clicked");
      }
      else if (filterNum === 3) {
        this.filterPrice3.classList.add("filter-button-clicked");
      }
    }

    var yelpPlacesResults = this.state.yelpPlacesResults.slice();
    var googlePlacesResults = this.state.googlePlacesResults.slice();
    var bothPlacesResults = this.state.bothPlacesResults.slice();
    var tempPlaceArray = this.filterResults(yelpPlacesResults,googlePlacesResults,bothPlacesResults, filterState);
    var currentYelpPlaces = tempPlaceArray[0].slice();
    var currentGooglePlaces = tempPlaceArray[1].slice();
    var sortState = this.state.sortStatus;
    var temp1PlaceArray = this.sortResults(currentYelpPlaces, currentGooglePlaces, sortState);
    currentYelpPlaces = temp1PlaceArray[0].slice();
    currentGooglePlaces = temp1PlaceArray[1].slice();
    this.makeMarkers(currentYelpPlaces, currentGooglePlaces);
    this.setState({currentGooglePlaces:currentGooglePlaces, currentYelpPlaces:currentYelpPlaces});
  }

  handleChange() {
    this.places = this.searchBox.getPlaces();
  }

  handleSubmit(event) {
    event.preventDefault();

    document.activeElement.blur();
    this.nonloaderEl.style.opacity = "0.2";
    this.loader.classList.add("loader-activated");
    this.loader.style.display = "block";
    document.getElementById('disablingDiv').style.display='block';

    const google = window.google;
    var map = this.state.map;
    var diagMeters;
    var bounds;
    var mapBounds;
    if (this.locationBoxEl !== "") {
      var places = this.locationBox.getPlaces();
      if (places !== undefined) {
        map.setCenter(places[0].geometry.location);
        mapBounds = map.getBounds();
        this.searchBox.setBounds(mapBounds);
        bounds = {
          lat: {
            min: mapBounds.f.b,
            max: mapBounds.f.f,
          },
          lon: {
            min: mapBounds.b.b,
            max: mapBounds.b.f,
          }
        };
        diagMeters = getDistanceFromLatLonInM(bounds.lat.min, bounds.lon.min, bounds.lat.max, bounds.lon.max);
        if (diagMeters > 40000 * 2) {
          diagMeters = 40000 * 2;
        }
      }
    }
    else {
      mapBounds = map.getBounds();
      this.searchBox.setBounds(mapBounds);
      bounds = {
        lat: {
          min: mapBounds.f.b,
          max: mapBounds.f.f,
        },
        lon: {
          min: mapBounds.b.b,
          max: mapBounds.b.f,
        }
      };
      diagMeters = getDistanceFromLatLonInM(bounds.lat.min, bounds.lon.min, bounds.lat.max, bounds.lon.max);
      if (diagMeters > 40000 * 2) {
        diagMeters = 40000 * 2;
      }
    }
    var yelpPlacesResults = [];
    var googlePlaces = [];
    var googlePlacesResults = [];
    var diagMeters;
    async.series([
      (callback) => {
        if (this.locationBoxEl !== "" && places === undefined) {
          var paramGoogleJSON = {
            query: this.locationBoxEl.value
          };
          fetch('/googlelocationsearch', {
            method: 'POST',
            body: JSON.stringify(paramGoogleJSON)
          })
          .then(res => res.json())
          .then(data => {
            if (data.results[0] !== undefined) {
              map.setCenter(data.results[0].geometry.location);
            }
            mapBounds = map.getBounds();
            this.searchBox.setBounds(mapBounds);
            bounds = {
              lat: {
                min: mapBounds.f.b,
                max: mapBounds.f.f,
              },
              lon: {
                min: mapBounds.b.b,
                max: mapBounds.b.f,
              }
            };
            diagMeters = getDistanceFromLatLonInM(bounds.lat.min, bounds.lon.min, bounds.lat.max, bounds.lon.max);
            if (diagMeters > 40000 * 2) {
              diagMeters = 40000 * 2;
            }
            callback();
          });
        }
        else {
          callback();
        }
      },
      (callback) => {
          var paramYelpJSON = {
            term: this.searchBoxEl.value,
            latitude: (bounds.lat.min + bounds.lat.max) / 2.0,
            longitude: (bounds.lon.min + bounds.lon.max) / 2.0,
            radius: Math.floor(diagMeters / 2.0),
            limit: 50
          }
          fetch('/yelpsearch', {
            method: 'POST',
            body: JSON.stringify(paramYelpJSON)
          })
          .then(res => res.json())
          .then(data => {
            var yelpPlaces = data.businesses;
            for (var i = 0; i < yelpPlaces.length; i++) {
              if (yelpPlaces[i].coordinates.latitude > bounds.lat.min && yelpPlaces[i].coordinates.latitude < bounds.lat.max && yelpPlaces[i].coordinates.longitude > bounds.lon.min && yelpPlaces[i].coordinates.longitude < bounds.lon.max) {
                var business = {
                  name: yelpPlaces[i].name,
                  reviewCount: yelpPlaces[i].review_count,
                  rating: yelpPlaces[i].rating,
                  priceLevel: yelpPlaces[i].price,
                  location: {
                    lat: yelpPlaces[i].coordinates.latitude,
                    lng: yelpPlaces[i].coordinates.longitude
                  },
                  distance: yelpPlaces[i].distance,
                  address: yelpPlaces[i].location.display_address[0] + ', ' + yelpPlaces[i].location.display_address[1],
                  url: 'https://www.yelp.com/biz/' + yelpPlaces[i].id
                };
                yelpPlacesResults.push(business);
              }
            }
            callback();
          }).catch(e => {
            console.log(e);
          });
        },
        (callback) => {
          var latitude = (bounds.lat.min + bounds.lat.max) / 2.0;
          var longitude = (bounds.lon.min + bounds.lon.max) / 2.0;
          if (diagMeters > 50000 * 2) {
            diagMeters = 50000 * 2;
          }
          var paramGoogleJSON = {
            keyword: this.searchBoxEl.value,
            location: latitude.toString() + "," + longitude.toString(),
            radius: Math.floor(diagMeters / 2.0),
          };
          fetch('/googlesearch', {
            method: 'POST',
            body: JSON.stringify(paramGoogleJSON)
          })
          .then(res => res.json())
          .then(data => {
            var googlePlaces = data.results;
            var googlePlacesLength = googlePlaces.length;
            googlePlacesResults = formatGoogleResults(googlePlacesResults,bounds,googlePlaces);
            paramGoogleJSON.pagetoken = data.next_page_token;
            if (googlePlacesLength === 20) {
              setTimeout( function() {
                fetch('/googlesearch', {
                  method: 'POST',
                  body: JSON.stringify(paramGoogleJSON)
                })
                .then(res1 => res1.json())
                .then(data1 => {
                  googlePlaces = data1.results;
                  googlePlacesResults = formatGoogleResults(googlePlacesResults,bounds,googlePlaces);
                  paramGoogleJSON.pagetoken = data1.next_page_token;
                  callback();
                })
              }, 1600);
            }
            else {
              callback();
            }
          });
        },
        (callback) => {
          var foundMatch;
          var bothPlacesResults = [];
          yelpPlacesResults.forEach((yelpPlace, yindex, yarray) => {
            foundMatch = false;
            googlePlacesResults.forEach((googlePlace, gindex, garray) => {
              if (!foundMatch) {
                if (placeMatch(googlePlace,yelpPlace)) {
                  bothPlacesResults.push({
                    yelp: yelpPlace,
                    google: googlePlace
                  });
                  foundMatch = true;
                }
              }
            });
          });
          var filterState = this.state.filterStatus;
          var tempPlaceArray = this.filterResults(yelpPlacesResults, googlePlacesResults, bothPlacesResults, filterState);
          var currentYelpPlaces = tempPlaceArray[0];
          var currentGooglePlaces = tempPlaceArray[1];
          tempPlaceArray = this.sortResults(currentYelpPlaces, currentGooglePlaces, this.state.sortStatus);
          var currentYelpPlaces = tempPlaceArray[0];
          var currentGooglePlaces = tempPlaceArray[1];
          this.makeMarkers(currentYelpPlaces, currentGooglePlaces);



          this.locationBoxEl.value = "";
          this.loader.classList.remove("loader-activated");
          this.nonloaderEl.style.opacity = "1";
          this.loader.style.display = "none";
          document.getElementById('disablingDiv').style.display='none';
          if (this.state.sortStatus === 0 && this.state.filterStatus[0] === false && this.state.filterStatus[1] === true && this.state.filterStatus[2] === true && this.state.filterStatus[3] === true) {
            this.sortBestMatch.classList.add("sort-button-clicked");
            this.filterPrice1.classList.add("filter-button-clicked");
            this.filterPrice2.classList.add("filter-button-clicked");
            this.filterPrice3.classList.add("filter-button-clicked");
          }
          this.setState({googlePlacesResults:googlePlacesResults, yelpPlacesResults:yelpPlacesResults, bothPlacesResults:bothPlacesResults, currentYelpPlaces: currentYelpPlaces, currentGooglePlaces:currentGooglePlaces});
          callback();
        }
    ]);
  }

  addMarkerListener(newMarker) {
    var map = this.state.map;
    const google = window.google;
    var infoWindow = this.infoWindow;
    google.maps.event.addListener(newMarker, 'click', function() {
      infoWindow.setContent(newMarker.content);
      infoWindow.open(map, newMarker);
    });
    this.markers.push(newMarker);
  }

  makeMarkers(currentYelpPlaces, currentGooglePlaces) {
    var map = this.state.map;
    const google = window.google;
    var infoWindow = this.infoWindow;
    var currentYelpPlaces = currentYelpPlaces.slice(0, this.maxLength);
    var currentGooglePlaces = currentGooglePlaces.slice(0, this.maxLength);
    var bothPlacesResults = [];
    if (this.state.map !== undefined) {
      this.markers.forEach(function(marker) {
        marker.setMap(null);
      });
      this.markers = [];
      var foundMatch;
      if (this.state.filterStatus[0]) {
        for (var i = 0; i < currentYelpPlaces.length; i++) {
          var bothPlaceMarker = new google.maps.Marker({
            map: map,
            title: currentGooglePlaces[i].name,
            position: currentGooglePlaces[i].location,
            icon: this.icons.yeggle.icon,
            content: '<h3>' + currentGooglePlaces[i].name + '</h3>' +
            '<p>' + 'Google: ' + currentGooglePlaces[i].rating + '<br>' +
            'Yelp: ' + currentYelpPlaces[i].rating + '</p>'
          });
          this.addMarkerListener(bothPlaceMarker);
        }
      }
      else {
        var onlyGooglePlacesResults = currentGooglePlaces.slice();
        var onlyYelpPlacesResults = currentYelpPlaces.slice();
        currentGooglePlaces.forEach((googlePlace, gindex, garray) => {
          foundMatch = false;
          currentYelpPlaces.forEach((yelpPlace, yindex, yarray) => {
            if (!foundMatch) {
              if (placeMatch(googlePlace,yelpPlace)) {
                bothPlacesResults.push({
                  google: googlePlace,
                  yelp: yelpPlace
                });
                onlyGooglePlacesResults[gindex] = 0;
                onlyYelpPlacesResults[yindex] = 0;
                foundMatch = true;
                var bothPlaceMarker = new google.maps.Marker({
                  map: map,
                  title: googlePlace.name,
                  position: googlePlace.location,
                  icon: this.icons.yeggle.icon,
                  content: '<h3>' + googlePlace.name + '</h3>' +
                  '<p>' + 'Google: ' + googlePlace.rating + '<br>' +
                  'Yelp: ' + yelpPlace.rating + '</p>'
                });
                this.addMarkerListener(bothPlaceMarker);
              }
            }
          });
          if (!foundMatch) {
            var googlePlaceMarker = new google.maps.Marker({
              map: map,
              title: googlePlace.name,
              position: googlePlace.location,
              icon: this.icons.google.icon,
              optimized: false,
              content: '<h3>' + googlePlace.name + '</h3>' +
              '<p>' + 'Google: ' + googlePlace.rating + '</p>'
            });
            this.addMarkerListener(googlePlaceMarker);
          }
        });
        onlyYelpPlacesResults = onlyYelpPlacesResults.filter((a) => a !== 0);
        onlyGooglePlacesResults = onlyGooglePlacesResults.filter((a) => a !== 0);
        onlyYelpPlacesResults.forEach((yelpPlace, yindex, yarray) => {
          var yelpPlaceMarker = new google.maps.Marker({
            map: map,
            title: yelpPlace.name,
            position: yelpPlace.location,
            icon: this.icons.yelp.icon,
            optimized: false,
            content: '<h3>' + yelpPlace.name + '</h3>' +
            '<p>' + 'Yelp: ' + yelpPlace.rating + '</p>'
          });
          this.addMarkerListener(yelpPlaceMarker);
        });
      }
    }
  }

  render() {
    var placesJSX = [];
    var googlePlacesJSX = [];
    var yelpPlacesJSX = [];
    if (this.state.currentGooglePlaces !== undefined && this.state.currentGooglePlaces!== null) {
      var currentGooglePlaces = this.state.currentGooglePlaces;
      var currentYelpPlaces = this.state.currentYelpPlaces;
      var i = 0;
      var googleStars;
      while (i < Math.max(currentGooglePlaces.length, currentYelpPlaces.length) && i < this.maxLength) {
        if (i < currentGooglePlaces.length) {
          if (currentGooglePlaces[i].rating == "" || currentGooglePlaces[i].rating == undefined) {
            googleStars = "";
          }
          else {
            googleStars = currentGooglePlaces[i].rating + ' stars';
          }
          googlePlacesJSX.push(
            <div className="item2-right">
              <h4><a href={currentGooglePlaces[i].url} target="_blank">{currentGooglePlaces[i].name}</a></h4>
              <p>{currentGooglePlaces[i].address}</p>
              <p>{currentGooglePlaces[i].priceLevel}</p>
              <p>{googleStars}</p>
              <p>{currentGooglePlaces[i].currStatus}</p>
            </div>
          );
        }
        else {
          googlePlacesJSX.push(
            <div className="item2-right-empty"></div>
          );
        }
        if (i < currentYelpPlaces.length) {
          yelpPlacesJSX.push(
            <div className="item2-left">
              <h4><a href={currentYelpPlaces[i].url} target="_blank">{currentYelpPlaces[i].name}</a></h4>
              <p>{currentYelpPlaces[i].address}</p>
              <p>{currentYelpPlaces[i].priceLevel}</p>
              <p>{currentYelpPlaces[i].rating} stars</p>
              <p>{currentYelpPlaces[i].reviewCount} reviews</p>
            </div>
          );
        }
        else {
          yelpPlacesJSX.push(
            <div className="item2-left-empty"></div>
          );
        }
        placesJSX.push(
          <div className="row2">
            {yelpPlacesJSX[i]}
            <div className="item2-center"></div>
            {googlePlacesJSX[i]}
          </div>
        );
        i++;
      }
    }
    return (
      <div className="App">
        <div id="loader" style={{display:'none'}} ref={(loader) => {this.loader = loader;}}></div>
        <div ref={(nonloaderEl) => {this.nonloaderEl = nonloaderEl;}}>
          <header className="App-header">
            <h1 className="App-title">Welcome to Yeggle</h1>
            <form onSubmit={this.handleSubmit}>
              <input onClick={this.handleSearchClick} onChange={this.handleChange} onKeyPress={this.handleChange} id="search-box" ref={(searchBoxEl) => {this.searchBoxEl = searchBoxEl;}} placeholder="Search for" />
              <input placeholder="Near" ref={(locationBoxEl) => {this.locationBoxEl = locationBoxEl;}}/>
              <input id="submit-button" type="submit"/>
            </form>
          </header>
          <div id="sticky-wrapper" ref={(stickyWrapper) => {this.stickyWrapper = stickyWrapper;}}>
            <div id="map" ref={(map) => {this.map = map;}}></div>
            <div id="button-div">
              <div className="sort-group" ref={(sortGroup) => {this.sortGroup = sortGroup;}}>
                <button className="sort-button sort-button-clicked" onClick={() => this.handleSortClick(0)} ref={(sortBestMatch) => {this.sortBestMatch = sortBestMatch;}}>Best Match</button>
                <button className="sort-button" onClick={() => this.handleSortClick(1)} ref={(sortReview) => {this.sortReview = sortReview;}}>Review Count</button>
                <button className="sort-button" onClick={() => this.handleSortClick(2)} ref={(sortRating) => {this.sortRating = sortRating;}}>Rating</button>
                <button className="sort-button" onClick={() => this.handleSortClick(3)} ref={(sortDistance) => {this.sortDistance = sortDistance;}}>Distance</button>
              </div>
              <div className="filter-group" ref={(filterGroup) => {this.filterGroup = filterGroup;}}>
                <button className="filter-button" onClick={() => this.handleFilterClick(0)} ref={(filterYeggle) => {this.filterYeggle = filterYeggle;}}>Yeggle</button>
                <button className="filter-button filter-button-clicked" onClick={() => this.handleFilterClick(1)} ref={(filterPrice1) => {this.filterPrice1 = filterPrice1;}}>$</button>
                <button className="filter-button filter-button-clicked" onClick={() => this.handleFilterClick(2)} ref={(filterPrice2) => {this.filterPrice2 = filterPrice2;}}>$$</button>
                <button className="filter-button filter-button-clicked" onClick={() => this.handleFilterClick(3)} ref={(filterPrice3) => {this.filterPrice3 = filterPrice3;}}>$$$</button>
              </div>
            </div>
            <div className="grid1">
              <div className="row1">
                <div className="item1-left">
                  <h3>Yelp</h3>
                </div>
                <div className="item1-center"></div>
                <div className="item1-right">
                  <h3>Google</h3>
                </div>
              </div>
            </div>
          </div>
          <div ref={(placeHolder) => {this.placeHolder = placeHolder;}}></div>
          <div className="grid2">
            {placesJSX}
          </div>
        </div>
      </div>
    );
  }
}

export default App;
